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
  saveCharacter,
  saveLocation,
  saveProp,
  saveSceneShots,
} from "@adapter/project-writer.js";
import {
  createAssetStore,
  AssetStoreError,
  type AssetSlot,
} from "@adapter/asset-store.js";
import { createProject, type Project } from "@domain/movie.js";
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

async function main(): Promise<void> {
  console.log(`[movie-gen] loading project from ${DATA_DIR}`);
  console.log(`[movie-gen] assets root: ${ASSETS_DIR}`);

  let currentProject: Project;
  try {
    currentProject = await loadProject(DATA_DIR);
    console.log(
      `[movie-gen] loaded ${currentProject.scenes.length} scenes, ` +
        `${currentProject.characters.length} characters, ` +
        `${currentProject.locations.length} locations, ` +
        `${currentProject.props.length} props`,
    );
  } catch (err) {
    if (err instanceof ProjectLoadError) {
      console.error(`[movie-gen] FAILED TO LOAD PROJECT:\n  ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  const assetStore = createAssetStore(ASSETS_DIR);
  const app = express();

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/movie", (_req, res) => {
    res.json(projectToMovieDto(currentProject));
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
