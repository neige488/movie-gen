/**
 * Local dev server.
 *
 * Slice #1: load Project at boot (fail-fast), serve MovieDto at /api/movie.
 * Slice #2 (this file's additions):
 *   - GET  /api/library             — LibraryDto (characters/locations/props with image slots)
 *   - POST /api/assets/upload       — multipart upload to AssetStore + YAML update
 *   - GET  /assets/*                — static binary serving (path-traversal guarded)
 *   - In-memory project state mutated on upload so subsequent /api/library /
 *     /api/movie calls see the new image paths without a server restart.
 *
 * Concurrency: single user assumption. last-write-wins (ADR 0001). The project
 * is held in a single `currentProject` variable, replaced atomically after
 * each upload completes.
 */

import express from "express";
import Busboy from "busboy";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadProject, ProjectLoadError } from "@adapter/project-repository.js";
import {
  loadArrangement,
  loadTotalPages,
  saveArrangement,
  saveTotalPages,
} from "@adapter/movie-manifest-repository.js";
import type { MovieArrangement } from "@domain/movie-arrangement.js";
import {
  loadPromptPreset,
  PromptPresetError,
} from "@adapter/prompt-preset-repository.js";
import {
  findUnregisteredMentions,
  findUnregisteredLooks,
  type PromptPreset,
} from "@domain/prompt-preset.js";
import {
  saveCharacter,
  saveLocation,
  saveProp,
  saveSceneFile,
  saveSceneShots,
} from "@adapter/project-writer.js";
import { saveScreenplay } from "@adapter/screenplay-writer.js";
import { copyScene } from "@adapter/scene-copier.js";
import {
  createAssetStore,
  AssetStoreError,
  type AssetSlot,
} from "@adapter/asset-store.js";
import { collectRefNames, createProject, type Project } from "@domain/movie.js";
import { projectToLibraryDto, projectToMovieDto } from "./dto-mapper.js";
import {
  applyUpload,
  UploadValidationError,
  type UploadCommand,
} from "./upload-handler.js";
import {
  applyTakeUpload,
  TakeUploadError,
  type TakeUploadCommand,
} from "./take-upload-handler.js";
import {
  applyToggleSceneStarred,
  applyToggleTakeStarred,
  StarredToggleError,
} from "./starred-toggle-handler.js";
import {
  applySluglineEdit,
  applyScreenplayEdit,
  applySceneCopy,
  LightEditError,
} from "./light-edit-handler.js";
import {
  applyAcknowledgeShot,
  applyAcknowledgeTake,
  AcknowledgeError,
} from "./acknowledge-handler.js";
import {
  applyShotPromptEdit,
  applyShotDurationEdit,
  applyShotCharacterRefsEdit,
  applyShotLocationRefsEdit,
  applyShotPrevShotRefEdit,
  applyShotPropRefsEdit,
  ShotEditError,
} from "./shot-edit-handler.js";
import { applyReorderScene, ReorderError } from "./reorder-handler.js";
import { applyMoveScene, MoveSceneError } from "./move-scene-handler.js";
import { startFileWatcher } from "@adapter/file-watcher.js";
import { createEventBus } from "./event-bus.js";
import { createReloadOrchestrator } from "./reload-orchestrator.js";
import { attachSseHandler } from "./sse-handler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../../..");
const DATA_DIR =
  process.env.MOVIEGEN_DATA_DIR ?? path.join(PROJECT_ROOT, "data");
const ASSETS_DIR =
  process.env.MOVIEGEN_ASSETS_DIR ?? path.join(PROJECT_ROOT, "assets");
const PORT = Number(process.env.MOVIEGEN_PORT ?? 5174);

const MAX_IMAGE_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB — images
// Take videos at ~15s max from 씨댄스 2.0 can run a few hundred MB. 500 MB
// gives headroom without enabling truly pathological uploads.
const MAX_VIDEO_UPLOAD_BYTES = 500 * 1024 * 1024;

/**
 * Validate that every inline `@mention` in every Shot prompt points at a ref
 * registered in the library (an ImageReference `refName` — see
 * `collectRefNames`). Opt-in: movies whose library assigns no refName are never
 * blocked. Throws PromptPresetError (which the boot path turns into a friendly
 * exit, and the reload path captures as reload-failed) so a typo'd `@name` is
 * caught loudly instead of silently producing a prompt the engine can't resolve.
 */
function assertRefsRegistered(project: Project): void {
  const prompts = project.scenes.flatMap((s) => s.shots.map((sh) => sh.prompt));
  const unknown = findUnregisteredMentions(prompts, collectRefNames(project));
  if (unknown.length > 0) {
    throw new PromptPresetError(
      `Shot 프롬프트가 라이브러리에 없는 ref를 참조합니다: ${unknown
        .map((n) => `@${n}`)
        .join(", ")}. 라이브러리 에셋의 refName으로 등록하거나 이름을 고치세요.`,
    );
  }
}

/**
 * Validate that every `look` key used by a Scene/Shot is defined in the preset's
 * `looks` map (the reserved `default` look included if used). Opt-in: when the
 * preset defines no `looks`, validation is skipped (see `findUnregisteredLooks`),
 * so movies that never configured looks are never blocked. Throws
 * PromptPresetError so a typo'd `look` is caught loudly at boot/reload instead of
 * silently dropping the camera/film package.
 */
function assertLooksRegistered(project: Project, preset: PromptPreset): void {
  const looksUsed = project.scenes.flatMap((s) => [
    s.look,
    ...s.shots.map((sh) => sh.look),
  ]);
  const unknown = findUnregisteredLooks(looksUsed, Object.keys(preset.looks));
  if (unknown.length > 0) {
    throw new PromptPresetError(
      `씬/샷이 프리셋에 없는 look을 참조합니다: ${unknown.join(
        ", ",
      )}. prompt-preset.yaml의 looks에 정의하거나 이름을 고치세요.`,
    );
  }
}

async function main(): Promise<void> {
  console.log(`[movie-gen] loading project from ${DATA_DIR}`);
  console.log(`[movie-gen] assets root: ${ASSETS_DIR}`);

  let currentProject: Project;
  // Scene-ordering SSOT (ADR 0002). Held alongside the Project so the
  // dto-mapper can thread the manifest order and the reorder endpoint can
  // mutate from the current arrangement without an extra disk read.
  let currentArrangement: MovieArrangement;
  // Movie length in BS2 pages (≈ minutes; default 110). Rescales displayed beat
  // page numbers only — see movie-manifest-repository.
  let currentTotalPages: number;
  // Movie-level prompt preset (common prefix/suffix + ref templates). Held
  // alongside the Project so the dto-mapper can assemble each Shot's final
  // copy-paste prompt without an extra disk read.
  let currentPreset: PromptPreset;
  try {
    currentProject = await loadProject(DATA_DIR);
    currentArrangement = await loadArrangement(DATA_DIR);
    currentTotalPages = await loadTotalPages(DATA_DIR);
    currentPreset = await loadPromptPreset(DATA_DIR);
    assertRefsRegistered(currentProject);
    assertLooksRegistered(currentProject, currentPreset);
    console.log(
      `[movie-gen] loaded ${currentProject.scenes.length} scenes, ` +
        `${currentProject.characters.length} characters, ` +
        `${currentProject.locations.length} locations, ` +
        `${currentProject.props.length} props`,
    );
  } catch (err) {
    if (err instanceof ProjectLoadError || err instanceof PromptPresetError) {
      console.error(`[movie-gen] FAILED TO LOAD PROJECT:\n  ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  // Build the MovieDto from the current in-memory state (project + arrangement
  // + totalPages + preset). Used by every endpoint that returns the movie.
  const movieDto = () =>
    projectToMovieDto(
      currentProject,
      currentArrangement,
      currentTotalPages,
      currentPreset,
    );

  const assetStore = createAssetStore(ASSETS_DIR);
  const app = express();
  // JSON parser scoped to small payloads — the starred-toggle endpoints carry
  // only {isStarred: boolean}. Upload endpoints use multipart and aren't
  // affected.
  app.use(express.json({ limit: "16kb" }));

  // ─── File watcher + SSE (Slice 9) ──────────────────────────────────────
  //
  // Wire-up order matters:
  //  1. Create the event bus first — both SSE clients and the reload
  //     orchestrator hold references.
  //  2. Attach the SSE endpoint so any client that connects during the
  //     watcher's startup is already subscribed.
  //  3. Create the orchestrator. Its `setProject` callback assigns into the
  //     same `currentProject` binding that all the HTTP handlers close over.
  //  4. Start the watcher last so we don't emit refreshes during the
  //     handlers wiring window.
  //
  // Mutation endpoints (upload, edit, copy, …) ALSO write to disk → the
  // watcher will fire on those too. That's harmless and actually useful:
  //  - extra clients (e.g. a second browser tab) see the change immediately
  //  - the orchestrator's coalescing guarantees we don't double-load
  // The mutation endpoint's own reply already carries the fresh MovieDto so
  // there's no extra round-trip for the originating client either.
  //
  // To run without the watcher (CI, debugging), set MOVIEGEN_WATCH=0.
  const eventBus = createEventBus();
  attachSseHandler(app, eventBus);
  const orchestrator = createReloadOrchestrator({
    // Reload BOTH the Project and the arrangement so an external change to
    // data/movie.yaml (or a Scene folder) is reflected in the order too. The
    // arrangement load is folded into loadProject's promise so the swap stays
    // atomic — setProject only fires after both have resolved.
    loadProject: async () => {
      const next = await loadProject(DATA_DIR);
      currentArrangement = await loadArrangement(DATA_DIR);
      currentTotalPages = await loadTotalPages(DATA_DIR);
      currentPreset = await loadPromptPreset(DATA_DIR);
      assertRefsRegistered(next);
      assertLooksRegistered(next, currentPreset);
      return next;
    },
    getProject: () => currentProject,
    setProject: (p) => {
      currentProject = p;
    },
    bus: eventBus,
  });
  let stopWatcher: (() => Promise<void>) | null = null;
  if (process.env.MOVIEGEN_WATCH !== "0") {
    try {
      const watcher = await startFileWatcher(
        DATA_DIR,
        () => {
          // The orchestrator does not throw — it captures errors into
          // bus.publish("reload-failed") — so a bare fire-and-forget is safe.
          void orchestrator.reload();
        },
        {
          debounceMs: Number(process.env.MOVIEGEN_WATCH_DEBOUNCE_MS ?? 200),
          onError: (err) => {
            // Watcher-level errors (permission denied, ENOSPC inotify watches
            // exhausted, etc.) are logged but do NOT crash the server.
            console.error("[movie-gen] file-watcher error:", err.message);
          },
        },
      );
      stopWatcher = () => watcher.stop();
      console.log(`[movie-gen] file-watcher active on ${DATA_DIR}`);
    } catch (err) {
      // Watcher boot failure is non-fatal — the server still serves data, it
      // just won't auto-reload. This is exactly the graceful behavior the
      // PRD asks for ("watcher 에러 시에도 서버는 계속 동작").
      console.error(
        "[movie-gen] file-watcher failed to start, continuing without auto-reload:",
        (err as Error).message,
      );
    }
  } else {
    console.log("[movie-gen] file-watcher disabled (MOVIEGEN_WATCH=0)");
  }

  // Clean shutdown — close the watcher before exiting so chokidar doesn't
  // leak the inotify/fsevents handle in long-lived dev sessions.
  function shutdown(): void {
    if (stopWatcher) {
      void stopWatcher().finally(() => process.exit(0));
    } else {
      process.exit(0);
    }
  }
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/movie", (_req, res) => {
    res.json(movieDto());
  });

  app.get("/api/library", (_req, res) => {
    res.json(projectToLibraryDto(currentProject));
  });

  // Static asset serving — explicit path resolution through AssetStore so any
  // traversal attempt produces a 400, not a 404.
  app.get("/assets/*", (req, res) => {
    const rel = decodeURIComponent(
      (req.params as { [key: string]: string })[0] ?? "",
    );
    try {
      const abs = assetStore.resolve(rel);
      res.sendFile(abs, (err) => {
        if (err) {
          res.status(404).end();
        }
      });
    } catch (err) {
      if (err instanceof AssetStoreError) {
        res.status(400).type("text/plain").send(err.message);
        return;
      }
      throw err;
    }
  });

  // Image upload endpoint. Multipart fields:
  //   slot   = JSON-encoded AssetSlot (image slots only — take-video is
  //            rejected here by upload-handler and must use /api/takes/upload)
  //   file   = the image binary
  app.post("/api/assets/upload", (req, res) => {
    const bb = Busboy({
      headers: req.headers,
      limits: { files: 1, fileSize: MAX_IMAGE_UPLOAD_BYTES, fields: 5 },
    });

    let slotJson = "";
    let fileBuf: Buffer | null = null;
    let fileName = "";
    let aborted = false;
    let tooLarge = false;

    bb.on("field", (name, val) => {
      if (name === "slot") slotJson = val;
    });

    bb.on("file", (_name, stream, info) => {
      fileName = info.filename ?? "";
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("limit", () => {
        tooLarge = true;
        stream.resume();
      });
      stream.on("end", () => {
        if (!tooLarge) fileBuf = Buffer.concat(chunks);
      });
    });

    bb.on("error", (err: Error) => {
      if (aborted) return;
      aborted = true;
      res.status(400).json({ error: err.message });
    });

    bb.on("close", () => {
      if (aborted) return;
      if (tooLarge) {
        res
          .status(413)
          .json({
            error: `file exceeds limit (${MAX_IMAGE_UPLOAD_BYTES} bytes)`,
          });
        return;
      }
      if (!slotJson || !fileBuf) {
        res
          .status(400)
          .json({ error: "missing 'slot' (json) or 'file' (binary)" });
        return;
      }
      let slot: AssetSlot;
      try {
        slot = JSON.parse(slotJson) as AssetSlot;
      } catch {
        res.status(400).json({ error: "slot is not valid JSON" });
        return;
      }
      const command: UploadCommand = {
        slot,
        originalFilename: fileName,
        data: fileBuf,
      };
      void handleUpload(command).then(
        (relativePath) => {
          res.json({ relativePath });
        },
        (err: Error) => {
          if (
            err instanceof AssetStoreError ||
            err instanceof UploadValidationError
          ) {
            // Client-actionable: bad slot input or unknown target object.
            res.status(400).json({ error: err.message });
          } else {
            console.error("[movie-gen] upload failed:", err);
            res.status(500).json({ error: err.message });
          }
        },
      );
    });

    req.pipe(bb);
  });

  // Take video upload endpoint. Multipart fields:
  //   sceneSlug = string
  //   shotId    = string
  //   file      = the video binary (mp4/webm/mov)
  app.post("/api/takes/upload", (req, res) => {
    const bb = Busboy({
      headers: req.headers,
      limits: { files: 1, fileSize: MAX_VIDEO_UPLOAD_BYTES, fields: 5 },
    });

    let sceneSlug = "";
    let shotId = "";
    let fileBuf: Buffer | null = null;
    let fileName = "";
    let aborted = false;
    let tooLarge = false;

    bb.on("field", (name, val) => {
      if (name === "sceneSlug") sceneSlug = val;
      else if (name === "shotId") shotId = val;
    });

    bb.on("file", (_name, stream, info) => {
      fileName = info.filename ?? "";
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("limit", () => {
        tooLarge = true;
        stream.resume();
      });
      stream.on("end", () => {
        if (!tooLarge) fileBuf = Buffer.concat(chunks);
      });
    });

    bb.on("error", (err: Error) => {
      if (aborted) return;
      aborted = true;
      res.status(400).json({ error: err.message });
    });

    bb.on("close", () => {
      if (aborted) return;
      if (tooLarge) {
        res
          .status(413)
          .json({
            error: `file exceeds limit (${MAX_VIDEO_UPLOAD_BYTES} bytes)`,
          });
        return;
      }
      if (!sceneSlug || !shotId || !fileBuf) {
        res.status(400).json({
          error:
            "missing 'sceneSlug', 'shotId', or 'file' (binary) in multipart body",
        });
        return;
      }
      const command: TakeUploadCommand = {
        sceneSlug,
        shotId,
        originalFilename: fileName,
        data: fileBuf,
      };
      void handleTakeUpload(command).then(
        (dto) => {
          res.json(dto);
        },
        (err: Error) => {
          if (
            err instanceof AssetStoreError ||
            err instanceof TakeUploadError
          ) {
            res.status(400).json({ error: err.message });
          } else {
            console.error("[movie-gen] take upload failed:", err);
            res.status(500).json({ error: err.message });
          }
        },
      );
    });

    req.pipe(bb);
  });

  // Scene starred toggle. Body: {"isStarred": boolean}. Returns updated MovieDto.
  app.post("/api/scenes/:slug/starred", (req, res) => {
    const slug = req.params.slug;
    const body = req.body as { isStarred?: unknown };
    if (typeof body?.isStarred !== "boolean") {
      res
        .status(400)
        .json({ error: "request body must be {isStarred: boolean}" });
      return;
    }
    void applyToggleSceneStarred({
      project: currentProject,
      sceneSlug: slug,
      isStarred: body.isStarred,
      dataDir: DATA_DIR,
      saveSceneFile,
      createProject,
    }).then(
      (result) => {
        currentProject = result.project;
        res.json(movieDto());
      },
      (err: Error) => {
        if (err instanceof StarredToggleError) {
          res.status(400).json({ error: err.message });
        } else {
          console.error("[movie-gen] scene starred toggle failed:", err);
          res.status(500).json({ error: err.message });
        }
      },
    );
  });

  // Take starred toggle. Body: {"isStarred": boolean}. Returns updated MovieDto.
  // The handler auto-OFFs any sibling starred Take in the same Shot to honor
  // the domain invariant (CONTEXT.md "Take.isStarred: Shot당 최대 1개").
  app.post(
    "/api/scenes/:slug/shots/:shotId/takes/:takeId/starred",
    (req, res) => {
      const { slug, shotId, takeId } = req.params;
      const body = req.body as { isStarred?: unknown };
      if (typeof body?.isStarred !== "boolean") {
        res
          .status(400)
          .json({ error: "request body must be {isStarred: boolean}" });
        return;
      }
      void applyToggleTakeStarred({
        project: currentProject,
        sceneSlug: slug,
        shotId,
        takeId,
        isStarred: body.isStarred,
        dataDir: DATA_DIR,
        saveSceneShots,
        createProject,
      }).then(
        (result) => {
          currentProject = result.project;
          res.json(movieDto());
        },
        (err: Error) => {
          if (err instanceof StarredToggleError) {
            res.status(400).json({ error: err.message });
          } else {
            console.error("[movie-gen] take starred toggle failed:", err);
            res.status(500).json({ error: err.message });
          }
        },
      );
    },
  );

  // --- Light edit (Slice 5) ------------------------------------------------

  // Slugline edit. Body: {"slugline": string}. Returns updated MovieDto.
  app.put("/api/scenes/:slug/slugline", (req, res) => {
    const slug = req.params.slug;
    const body = req.body as { slugline?: unknown };
    if (typeof body?.slugline !== "string") {
      res
        .status(400)
        .json({ error: "request body must be {slugline: string}" });
      return;
    }
    void applySluglineEdit({
      project: currentProject,
      sceneSlug: slug,
      slugline: body.slugline,
      dataDir: DATA_DIR,
      saveSceneFile,
      createProject,
    }).then(
      (result) => {
        currentProject = result.project;
        res.json(movieDto());
      },
      (err: Error) => {
        if (err instanceof LightEditError) {
          res.status(400).json({ error: err.message });
        } else {
          console.error("[movie-gen] slugline edit failed:", err);
          res.status(500).json({ error: err.message });
        }
      },
    );
  });

  // Screenplay edit. Body: {"markdown": string}. Strict marker validation —
  // 4xx if the new text drops/adds shot markers vs the existing Shot ids.
  app.put("/api/scenes/:slug/screenplay", (req, res) => {
    const slug = req.params.slug;
    const body = req.body as { markdown?: unknown };
    if (typeof body?.markdown !== "string") {
      res
        .status(400)
        .json({ error: "request body must be {markdown: string}" });
      return;
    }
    void applyScreenplayEdit({
      project: currentProject,
      sceneSlug: slug,
      markdown: body.markdown,
      dataDir: DATA_DIR,
      saveScreenplay,
      createProject,
    }).then(
      (result) => {
        currentProject = result.project;
        res.json(movieDto());
      },
      (err: Error) => {
        if (err instanceof LightEditError) {
          res.status(400).json({ error: err.message });
        } else {
          console.error("[movie-gen] screenplay edit failed:", err);
          res.status(500).json({ error: err.message });
        }
      },
    );
  });

  // --- Shot meta edit (Slice 7) -------------------------------------------
  //
  // Five per-field endpoints. Mirrors the per-field split from Slice 5
  // (slugline / screenplay), keeping the wiring uniform — one HTTP endpoint
  // per domain mutator. All return the full updated MovieDto so the client
  // refresh is a single round-trip.

  type ShotEditRunner = () => Promise<{ project: Project }>;
  function runShotEdit(res: express.Response, runner: ShotEditRunner): void {
    void runner().then(
      (result) => {
        currentProject = result.project;
        res.json(movieDto());
      },
      (err: Error) => {
        if (err instanceof ShotEditError) {
          res.status(400).json({ error: err.message });
        } else {
          console.error("[movie-gen] shot edit failed:", err);
          res.status(500).json({ error: err.message });
        }
      },
    );
  }

  app.put("/api/scenes/:slug/shots/:shotId/prompt", (req, res) => {
    const { slug, shotId } = req.params;
    const body = req.body as { prompt?: unknown };
    if (typeof body?.prompt !== "string") {
      res.status(400).json({ error: "request body must be {prompt: string}" });
      return;
    }
    runShotEdit(res, () =>
      applyShotPromptEdit({
        project: currentProject,
        sceneSlug: slug,
        shotId,
        prompt: body.prompt as string,
        dataDir: DATA_DIR,
        saveSceneShots,
        createProject,
      }),
    );
  });

  app.put("/api/scenes/:slug/shots/:shotId/duration", (req, res) => {
    const { slug, shotId } = req.params;
    const body = req.body as { duration?: unknown };
    if (typeof body?.duration !== "number" || !Number.isFinite(body.duration)) {
      res
        .status(400)
        .json({ error: "request body must be {duration: number}" });
      return;
    }
    runShotEdit(res, () =>
      applyShotDurationEdit({
        project: currentProject,
        sceneSlug: slug,
        shotId,
        duration: body.duration as number,
        dataDir: DATA_DIR,
        saveSceneShots,
        createProject,
      }),
    );
  });

  app.put("/api/scenes/:slug/shots/:shotId/character-refs", (req, res) => {
    const { slug, shotId } = req.params;
    const body = req.body as { refs?: unknown };
    const refs = body?.refs;
    if (!Array.isArray(refs)) {
      res.status(400).json({
        error:
          "request body must be {refs: {character: string, look: string}[]}",
      });
      return;
    }
    // Shape check — domain rejects unknown refs via createProject, but we
    // pre-validate the wire shape so a malformed payload returns 400 cleanly.
    for (const r of refs) {
      if (
        typeof r?.character !== "string" ||
        typeof r?.look !== "string"
      ) {
        res.status(400).json({
          error: "each ref requires {character: string, look: string}",
        });
        return;
      }
    }
    runShotEdit(res, () =>
      applyShotCharacterRefsEdit({
        project: currentProject,
        sceneSlug: slug,
        shotId,
        refs: refs as { character: string; look: string }[],
        dataDir: DATA_DIR,
        saveSceneShots,
        createProject,
      }),
    );
  });

  app.put("/api/scenes/:slug/shots/:shotId/location-refs", (req, res) => {
    const { slug, shotId } = req.params;
    const body = req.body as { refs?: unknown };
    const refs = body?.refs;
    if (!Array.isArray(refs)) {
      res.status(400).json({
        error:
          "request body must be {refs: {location: string, reference?: string}[]}",
      });
      return;
    }
    for (const r of refs) {
      if (typeof r?.location !== "string") {
        res
          .status(400)
          .json({ error: "each ref requires {location: string}" });
        return;
      }
      if (r.reference !== undefined && typeof r.reference !== "string") {
        res
          .status(400)
          .json({ error: "ref.reference must be string when provided" });
        return;
      }
    }
    runShotEdit(res, () =>
      applyShotLocationRefsEdit({
        project: currentProject,
        sceneSlug: slug,
        shotId,
        refs: refs as { location: string; reference?: string }[],
        dataDir: DATA_DIR,
        saveSceneShots,
        createProject,
      }),
    );
  });

  // Shot prevShotRef (chaining) — Slice 8. Body: {"prevShotRef": string | null}.
  // null clears the chain. Domain enforces same-Scene + earlier-Shot via the
  // createScene invariant inside setShotPrevShotRef.
  app.put("/api/scenes/:slug/shots/:shotId/prev-shot-ref", (req, res) => {
    const { slug, shotId } = req.params;
    const body = req.body as { prevShotRef?: unknown };
    const raw = body?.prevShotRef;
    if (raw !== null && typeof raw !== "string") {
      res.status(400).json({
        error: "request body must be {prevShotRef: string | null}",
      });
      return;
    }
    runShotEdit(res, () =>
      applyShotPrevShotRefEdit({
        project: currentProject,
        sceneSlug: slug,
        shotId,
        prevShotRef: raw,
        dataDir: DATA_DIR,
        saveSceneShots,
        createProject,
      }),
    );
  });

  app.put("/api/scenes/:slug/shots/:shotId/prop-refs", (req, res) => {
    const { slug, shotId } = req.params;
    const body = req.body as { refs?: unknown };
    const refs = body?.refs;
    if (!Array.isArray(refs)) {
      res.status(400).json({
        error:
          "request body must be {refs: {prop: string, reference?: string}[]}",
      });
      return;
    }
    for (const r of refs) {
      if (typeof r?.prop !== "string") {
        res.status(400).json({ error: "each ref requires {prop: string}" });
        return;
      }
      if (r.reference !== undefined && typeof r.reference !== "string") {
        res
          .status(400)
          .json({ error: "ref.reference must be string when provided" });
        return;
      }
    }
    runShotEdit(res, () =>
      applyShotPropRefsEdit({
        project: currentProject,
        sceneSlug: slug,
        shotId,
        refs: refs as { prop: string; reference?: string }[],
        dataDir: DATA_DIR,
        saveSceneShots,
        createProject,
      }),
    );
  });

  // --- Acknowledge (Slice 6) ----------------------------------------------

  // "Shot 확인됨" — refresh Shot.screenplayHash to the current marker block
  // hash. No body required. Returns the updated MovieDto so the client sees
  // the new syncStatus immediately. Orphan Shot rejects (400).
  app.post("/api/scenes/:slug/shots/:shotId/acknowledge", (req, res) => {
    const { slug, shotId } = req.params;
    void applyAcknowledgeShot({
      project: currentProject,
      sceneSlug: slug,
      shotId,
      dataDir: DATA_DIR,
      saveSceneShots,
      createProject,
    }).then(
      (result) => {
        currentProject = result.project;
        res.json(movieDto());
      },
      (err: Error) => {
        if (err instanceof AcknowledgeError) {
          res.status(400).json({ error: err.message });
        } else {
          console.error("[movie-gen] shot acknowledge failed:", err);
          res.status(500).json({ error: err.message });
        }
      },
    );
  });

  // "Take 확인됨" — refresh Take.screenplayHash only. Other Take fields
  // (videoPath, createdAt, isStarred) are preserved. Returns updated MovieDto.
  app.post(
    "/api/scenes/:slug/shots/:shotId/takes/:takeId/acknowledge",
    (req, res) => {
      const { slug, shotId, takeId } = req.params;
      void applyAcknowledgeTake({
        project: currentProject,
        sceneSlug: slug,
        shotId,
        takeId,
        dataDir: DATA_DIR,
        saveSceneShots,
        createProject,
      }).then(
        (result) => {
          currentProject = result.project;
          res.json(movieDto());
        },
        (err: Error) => {
          if (err instanceof AcknowledgeError) {
            res.status(400).json({ error: err.message });
          } else {
            console.error("[movie-gen] take acknowledge failed:", err);
            res.status(500).json({ error: err.message });
          }
        },
      );
    },
  );

  // Scene copy. Body: {"newSlug": string}. Returns updated MovieDto +
  // newSlug so the client can navigate to the new Scene immediately.
  app.post("/api/scenes/:slug/copy", (req, res) => {
    const slug = req.params.slug;
    const body = req.body as { newSlug?: unknown };
    if (typeof body?.newSlug !== "string") {
      res
        .status(400)
        .json({ error: "request body must be {newSlug: string}" });
      return;
    }
    void applySceneCopy({
      project: currentProject,
      sourceSlug: slug,
      newSlug: body.newSlug,
      dataDir: DATA_DIR,
      copyScene,
      loadProject,
    }).then(
      async (result) => {
        currentProject = result.project;
        // The copy added a new Scene folder → reconcile placed it at the end
        // of act 1. Refresh the in-memory arrangement so the MovieDto order
        // includes the new Scene's manifest slot.
        currentArrangement = await loadArrangement(DATA_DIR);
        res.json({
          movie: movieDto(),
          newSlug: result.newSlug,
        });
      },
      (err: Error) => {
        if (err instanceof LightEditError) {
          res.status(400).json({ error: err.message });
        } else if (err instanceof ProjectLoadError) {
          // The copy succeeded but the reloaded project failed schema/invariant
          // validation. Surface as 500 since it points to data inconsistency,
          // not a client error.
          console.error(
            "[movie-gen] scene copy reload failed:",
            err.message,
          );
          res.status(500).json({ error: err.message });
        } else {
          console.error("[movie-gen] scene copy failed:", err);
          res.status(500).json({ error: err.message });
        }
      },
    );
  });

  // --- Scene reorder (Slice #19) ------------------------------------------
  //
  // Move a Scene one step earlier/later within its act in the manifest
  // (data/movie.yaml). Body: {"direction": "up" | "down"}. Returns the updated
  // MovieDto. Cross-act moves are the BS2 canvas's job (#21) — this endpoint
  // clamps within the Scene's own act. Mutates the manifest atomically and
  // rebuilds the Project so the new order survives a refresh.
  app.post("/api/scenes/:slug/reorder", (req, res) => {
    const slug = req.params.slug;
    const body = req.body as { direction?: unknown };
    if (body?.direction !== "up" && body?.direction !== "down") {
      res
        .status(400)
        .json({ error: 'request body must be {direction: "up" | "down"}' });
      return;
    }
    void applyReorderScene({
      project: currentProject,
      arrangement: currentArrangement,
      sceneSlug: slug,
      direction: body.direction,
      dataDir: DATA_DIR,
      saveArrangement,
      loadProject,
    }).then(
      (result) => {
        currentProject = result.project;
        currentArrangement = result.arrangement;
        res.json(movieDto());
      },
      (err: Error) => {
        if (err instanceof ReorderError) {
          res.status(400).json({ error: err.message });
        } else {
          console.error("[movie-gen] scene reorder failed:", err);
          res.status(500).json({ error: err.message });
        }
      },
    );
  });

  // --- Scene move (BS2 canvas drag, Slice #21) ----------------------------
  //
  // Move a Scene to an arbitrary act + visible drop position via canvas drag.
  // Body: {"toActId": 1|2|3, "beforeSlug": string | null}. `beforeSlug` is the
  // starred slug to land BEFORE, or null for the end of that act's visible row.
  // Unlike /reorder (Scenes-view ▲/▼, same-act one-step), this allows CROSS-act
  // moves — the act-sequential invariant is enforced by the domain
  // (MovieArrangement.moveScene). Rewrites the manifest atomically and rebuilds
  // the Project so the new placement survives a refresh.
  app.post("/api/scenes/:slug/move", (req, res) => {
    const slug = req.params.slug;
    const body = req.body as { toActId?: unknown; beforeSlug?: unknown };
    if (body?.toActId !== 1 && body?.toActId !== 2 && body?.toActId !== 3) {
      res
        .status(400)
        .json({ error: "request body must include toActId of 1, 2, or 3" });
      return;
    }
    if (
      body.beforeSlug !== null &&
      typeof body.beforeSlug !== "string"
    ) {
      res
        .status(400)
        .json({ error: "beforeSlug must be a string or null" });
      return;
    }
    void applyMoveScene({
      project: currentProject,
      arrangement: currentArrangement,
      sceneSlug: slug,
      toActId: body.toActId,
      beforeSlug: body.beforeSlug,
      dataDir: DATA_DIR,
      saveArrangement,
      loadProject,
    }).then(
      (result) => {
        currentProject = result.project;
        currentArrangement = result.arrangement;
        res.json(movieDto());
      },
      (err: Error) => {
        if (err instanceof MoveSceneError) {
          res.status(400).json({ error: err.message });
        } else {
          console.error("[movie-gen] scene move failed:", err);
          res.status(500).json({ error: err.message });
        }
      },
    );
  });

  // --- Movie total length ---------------------------------------------------
  //
  // Set the movie's total length in BS2 pages (≈ minutes). Body:
  // {"totalPages": number}. Default is 110 (Blake). Only rescales displayed
  // beat page numbers — proportions are unchanged. Persisted to data/movie.yaml
  // (preserving the acts) so it survives a refresh. Returns the updated MovieDto.
  app.post("/api/movie/total-pages", (req, res) => {
    const body = req.body as { totalPages?: unknown };
    const n = body?.totalPages;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 100000) {
      res.status(400).json({
        error: "request body must be {totalPages: integer 1..100000}",
      });
      return;
    }
    void saveTotalPages(DATA_DIR, n).then(
      () => {
        currentTotalPages = n;
        res.json(movieDto());
      },
      (err: Error) => {
        console.error("[movie-gen] set total-pages failed:", err);
        res.status(500).json({ error: err.message });
      },
    );
  });

  async function handleUpload(command: UploadCommand): Promise<string> {
    const result = await applyUpload({
      project: currentProject,
      command,
      assetStore,
      dataDir: DATA_DIR,
      saveCharacter,
      saveLocation,
      saveProp,
      createProject,
    });
    currentProject = result.project;
    return result.relativePath;
  }

  async function handleTakeUpload(
    command: TakeUploadCommand,
  ): Promise<{
    take: {
      id: string;
      videoPath: string;
      screenplayHash: string;
      createdAt: string;
      isStarred: boolean;
    };
    sceneSlug: string;
    shotId: string;
  }> {
    const result = await applyTakeUpload({
      project: currentProject,
      command,
      assetStore,
      dataDir: DATA_DIR,
      saveSceneShots,
      createProject,
      clock: () => new Date(),
    });
    currentProject = result.project;
    return {
      take: {
        id: result.take.id,
        videoPath: result.take.videoPath,
        screenplayHash: result.take.screenplayHash,
        createdAt: result.take.createdAt,
        isStarred: result.take.isStarred,
      },
      sceneSlug: command.sceneSlug,
      shotId: command.shotId,
    };
  }

  app.listen(PORT, () => {
    console.log(`[movie-gen] api ready at http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error("[movie-gen] fatal:", err);
  process.exit(1);
});
