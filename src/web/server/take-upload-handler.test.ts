/**
 * Take upload handler — integration tests against real temp data/ + assets/.
 *
 * The handler is the domain-aware orchestrator:
 *   1. Validate the target Scene + Shot exist in the loaded Project.
 *   2. Compute the current screenplayHash from the Shot's marker block in
 *      `screenplay.md` (snapshot at upload time per CONTEXT.md).
 *   3. Allocate the next Take id by scanning existing takes for that Shot.
 *   4. Upload the binary via AssetStore.upload (take-video slot).
 *   5. Append a new Take (isStarred=false, createdAt=now) to the Shot.
 *   6. Save shots.yaml via saveSceneShots.
 *   7. Rebuild the Project (re-validate invariants) and return it + the new
 *      Take DTO.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  existsSync,
} from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { loadProject } from "@adapter/project-repository.js";
import {
  saveSceneShots,
} from "@adapter/project-writer.js";
import { createAssetStore } from "@adapter/asset-store.js";
import { createProject } from "@domain/movie.js";
import { applyTakeUpload, TakeUploadError } from "./take-upload-handler.js";

let dataDir: string;
let assetsDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "moviegen-take-data-"));
  assetsDir = mkdtempSync(path.join(tmpdir(), "moviegen-take-assets-"));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(assetsDir, { recursive: true, force: true });
});

const SCENE_SLUG = "s01-open";

function writeScene(opts?: { takes?: string }): void {
  const sceneDir = path.join(dataDir, "scenes", SCENE_SLUG);
  mkdirSync(sceneDir, { recursive: true });
  writeFileSync(
    path.join(sceneDir, "scene.yaml"),
    `slugline: "INT. ROOM - DAY"\nisStarred: true\n`,
  );
  // Block body "Hi." — its hash is deterministic, see assertion below.
  writeFileSync(
    path.join(sceneDir, "screenplay.md"),
    `<!-- shot:01 -->\nHi.\n<!-- /shot:01 -->\n`,
  );
  writeFileSync(
    path.join(sceneDir, "shots.yaml"),
    [
      `shots:`,
      `  - id: "01"`,
      `    prompt: "wide shot"`,
      `    duration: 5`,
      `    screenplayHash: "h"`,
      `    characterRefs: []`,
      `    locationRefs: []`,
      `    propRefs: []`,
      opts?.takes ?? `    takes: []`,
      ``,
    ].join("\n"),
  );
}

async function setup() {
  writeScene();
  const project = await loadProject(dataDir);
  const assetStore = createAssetStore(assetsDir);
  return { project, assetStore };
}

const FIXED_NOW = new Date("2026-06-03T10:00:00.000Z");
const clock = () => FIXED_NOW;

describe("applyTakeUpload — happy path", () => {
  it("writes mp4 binary, appends Take, persists shots.yaml, reloads", async () => {
    const ctx = await setup();

    const result = await applyTakeUpload({
      project: ctx.project,
      command: {
        sceneSlug: SCENE_SLUG,
        shotId: "01",
        originalFilename: "raw.mp4",
        data: Buffer.from("MP4-BYTES"),
      },
      assetStore: ctx.assetStore,
      dataDir,
      saveSceneShots,
      createProject,
      clock,
    });

    // Binary saved under expected path.
    expect(result.take.videoPath).toBe(
      "videos/scenes/s01-open/shots/01/takes/take-001.mp4",
    );
    expect(
      existsSync(path.join(assetsDir, result.take.videoPath)),
    ).toBe(true);
    expect(
      readFileSync(path.join(assetsDir, result.take.videoPath), "utf8"),
    ).toBe("MP4-BYTES");

    // Take metadata.
    expect(result.take.id).toBe("take-001");
    expect(result.take.isStarred).toBe(false);
    expect(result.take.createdAt).toBe("2026-06-03T10:00:00.000Z");
    // screenplayHash = sha256 of normalized marker-block body "Hi."
    // Verified by re-loading and inspecting the Shot below.

    // YAML on disk has the take.
    const reloaded = await loadProject(dataDir);
    const reloadedShot = reloaded.scenes[0]!.shots[0]!;
    expect(reloadedShot.takes).toHaveLength(1);
    expect(reloadedShot.takes[0]!.id).toBe("take-001");
    expect(reloadedShot.takes[0]!.videoPath).toBe(
      "videos/scenes/s01-open/shots/01/takes/take-001.mp4",
    );
    expect(reloadedShot.takes[0]!.createdAt).toBe(
      "2026-06-03T10:00:00.000Z",
    );
    expect(reloadedShot.takes[0]!.isStarred).toBe(false);
    // Hash should match the current marker-block hash. The reloaded Shot
    // still has its old hash ("h") but the new Take pins the snapshot.
    expect(reloadedShot.takes[0]!.screenplayHash).toBe(
      result.take.screenplayHash,
    );

    // In-memory project also updated.
    expect(result.project.scenes[0]!.shots[0]!.takes).toHaveLength(1);
  });

  it("allocates take-002, take-003 on successive uploads to same Shot", async () => {
    let ctx = await setup();

    const r1 = await applyTakeUpload({
      project: ctx.project,
      command: {
        sceneSlug: SCENE_SLUG,
        shotId: "01",
        originalFilename: "a.mp4",
        data: Buffer.from("A"),
      },
      assetStore: ctx.assetStore,
      dataDir,
      saveSceneShots,
      createProject,
      clock,
    });
    ctx = { ...ctx, project: r1.project };

    const r2 = await applyTakeUpload({
      project: ctx.project,
      command: {
        sceneSlug: SCENE_SLUG,
        shotId: "01",
        originalFilename: "b.mp4",
        data: Buffer.from("B"),
      },
      assetStore: ctx.assetStore,
      dataDir,
      saveSceneShots,
      createProject,
      clock,
    });
    ctx = { ...ctx, project: r2.project };

    const r3 = await applyTakeUpload({
      project: ctx.project,
      command: {
        sceneSlug: SCENE_SLUG,
        shotId: "01",
        originalFilename: "c.webm",
        data: Buffer.from("C"),
      },
      assetStore: ctx.assetStore,
      dataDir,
      saveSceneShots,
      createProject,
      clock,
    });

    expect(r1.take.id).toBe("take-001");
    expect(r2.take.id).toBe("take-002");
    expect(r3.take.id).toBe("take-003");
    expect(r3.take.videoPath).toBe(
      "videos/scenes/s01-open/shots/01/takes/take-003.webm",
    );

    const reloaded = await loadProject(dataDir);
    expect(reloaded.scenes[0]!.shots[0]!.takes).toHaveLength(3);
  });

  it("continues numbering after the highest existing take-NNN id", async () => {
    writeScene({
      takes: [
        `    takes:`,
        `      - id: take-005`,
        `        videoPath: videos/scenes/s01-open/shots/01/takes/take-005.mp4`,
        `        screenplayHash: existing`,
        `        createdAt: "2026-05-01T09:00:00.000Z"`,
        `        isStarred: false`,
      ].join("\n"),
    });
    const project = await loadProject(dataDir);
    const assetStore = createAssetStore(assetsDir);

    const result = await applyTakeUpload({
      project,
      command: {
        sceneSlug: SCENE_SLUG,
        shotId: "01",
        originalFilename: "x.mp4",
        data: Buffer.from("X"),
      },
      assetStore,
      dataDir,
      saveSceneShots,
      createProject,
      clock,
    });

    expect(result.take.id).toBe("take-006");
  });

  it("computes screenplayHash from the current marker block (not the stored Shot hash)", async () => {
    // The shots.yaml has screenplayHash: "h" (stale), but the actual marker
    // block body is "Hi." — the new Take must snapshot the CURRENT hash.
    const ctx = await setup();
    const result = await applyTakeUpload({
      project: ctx.project,
      command: {
        sceneSlug: SCENE_SLUG,
        shotId: "01",
        originalFilename: "v.mp4",
        data: Buffer.from("V"),
      },
      assetStore: ctx.assetStore,
      dataDir,
      saveSceneShots,
      createProject,
      clock,
    });

    // sha256("Hi.") after trim — should NOT equal "h"
    expect(result.take.screenplayHash).not.toBe("h");
    expect(result.take.screenplayHash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("applyTakeUpload — validation", () => {
  it("rejects unknown Scene", async () => {
    const ctx = await setup();
    await expect(
      applyTakeUpload({
        project: ctx.project,
        command: {
          sceneSlug: "ghost-scene",
          shotId: "01",
          originalFilename: "v.mp4",
          data: Buffer.from("V"),
        },
        assetStore: ctx.assetStore,
        dataDir,
        saveSceneShots,
        createProject,
        clock,
      }),
    ).rejects.toThrow(TakeUploadError);
  });

  it("rejects unknown Shot within a known Scene", async () => {
    const ctx = await setup();
    await expect(
      applyTakeUpload({
        project: ctx.project,
        command: {
          sceneSlug: SCENE_SLUG,
          shotId: "99",
          originalFilename: "v.mp4",
          data: Buffer.from("V"),
        },
        assetStore: ctx.assetStore,
        dataDir,
        saveSceneShots,
        createProject,
        clock,
      }),
    ).rejects.toThrow(TakeUploadError);
  });

  it("rejects Shot with no matching marker block (orphan)", async () => {
    // Write a Shot with id "02" but the screenplay has no <!-- shot:02 -->.
    const sceneDir = path.join(dataDir, "scenes", SCENE_SLUG);
    mkdirSync(sceneDir, { recursive: true });
    writeFileSync(
      path.join(sceneDir, "scene.yaml"),
      `slugline: "X"\nisStarred: true\n`,
    );
    writeFileSync(
      path.join(sceneDir, "screenplay.md"),
      `<!-- shot:01 -->\nA.\n<!-- /shot:01 -->\n`,
    );
    writeFileSync(
      path.join(sceneDir, "shots.yaml"),
      [
        `shots:`,
        `  - id: "02"`,
        `    prompt: "orphan"`,
        `    duration: 5`,
        `    screenplayHash: "h"`,
        `    characterRefs: []`,
        `    locationRefs: []`,
        `    propRefs: []`,
        `    takes: []`,
        ``,
      ].join("\n"),
    );
    const project = await loadProject(dataDir);
    const assetStore = createAssetStore(assetsDir);
    await expect(
      applyTakeUpload({
        project,
        command: {
          sceneSlug: SCENE_SLUG,
          shotId: "02",
          originalFilename: "v.mp4",
          data: Buffer.from("V"),
        },
        assetStore,
        dataDir,
        saveSceneShots,
        createProject,
        clock,
      }),
    ).rejects.toThrow(/orphan|marker/i);
  });
});

describe("applyTakeUpload — preserves other Scenes' shots.yaml", () => {
  it("does not rewrite a sibling scene's shots.yaml", async () => {
    writeScene();
    const otherDir = path.join(dataDir, "scenes", "s02-other");
    mkdirSync(otherDir, { recursive: true });
    writeFileSync(
      path.join(otherDir, "scene.yaml"),
      `slugline: "X"\nisStarred: false\n`,
    );
    writeFileSync(
      path.join(otherDir, "screenplay.md"),
      `<!-- shot:01 -->\nOther.\n<!-- /shot:01 -->\n`,
    );
    const originalShotsYaml = [
      `shots:`,
      `  - id: "01"`,
      `    prompt: "do not touch"`,
      `    duration: 5`,
      `    screenplayHash: "h"`,
      `    characterRefs: []`,
      `    locationRefs: []`,
      `    propRefs: []`,
      `    takes: []`,
      ``,
    ].join("\n");
    writeFileSync(path.join(otherDir, "shots.yaml"), originalShotsYaml);

    const project = await loadProject(dataDir);
    const assetStore = createAssetStore(assetsDir);
    await applyTakeUpload({
      project,
      command: {
        sceneSlug: SCENE_SLUG,
        shotId: "01",
        originalFilename: "v.mp4",
        data: Buffer.from("V"),
      },
      assetStore,
      dataDir,
      saveSceneShots,
      createProject,
      clock,
    });

    // The sibling scene's shots.yaml is unchanged byte-for-byte.
    expect(readFileSync(path.join(otherDir, "shots.yaml"), "utf8")).toBe(
      originalShotsYaml,
    );
  });
});
