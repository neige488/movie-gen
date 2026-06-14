/**
 * Reorder handler — integration tests against real temp data/.
 *
 * applyReorderScene moves a Scene one step earlier/later within its OWN act
 * (cross-act moves are the BS2 canvas's job — issue #21 — and are out of
 * scope here). It rewrites data/movie.yaml atomically and rebuilds the
 * in-memory Project so /api/movie reflects the new order.
 *
 * Mirrors the starred-toggle-handler test pattern: write temp scenes, load
 * the real Project + arrangement, apply, assert both the manifest on disk and
 * the rebuilt Project's scene order.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import yaml from "js-yaml";
import { loadProject } from "@adapter/project-repository.js";
import {
  loadArrangement,
  saveArrangement,
} from "@adapter/movie-manifest-repository.js";
import {
  applyReorderScene,
  ReorderError,
} from "./reorder-handler.js";

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "moviegen-reorder-"));
  mkdirSync(path.join(dataDir, "scenes"), { recursive: true });
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

function writeScene(slug: string, isStarred = true): void {
  const sceneDir = path.join(dataDir, "scenes", slug);
  mkdirSync(sceneDir, { recursive: true });
  writeFileSync(
    path.join(sceneDir, "scene.yaml"),
    `slugline: "INT. ${slug.toUpperCase()} - DAY"\nisStarred: ${isStarred}\n`,
  );
  writeFileSync(
    path.join(sceneDir, "screenplay.md"),
    `<!-- shot:01 -->\nA.\n<!-- /shot:01 -->\n`,
  );
  writeFileSync(
    path.join(sceneDir, "shots.yaml"),
    [
      `shots:`,
      `  - id: "01"`,
      `    prompt: "wide"`,
      `    duration: 5`,
      `    screenplayHash: "h"`,
      `    characterRefs: []`,
      `    locationRefs: []`,
      `    propRefs: []`,
      `    takes: []`,
      ``,
    ].join("\n"),
  );
}

function writeManifest(text: string): void {
  writeFileSync(path.join(dataDir, "movie.yaml"), text);
}

function readManifestActs(): { id: number; scenes: string[] }[] {
  const raw = yaml.load(
    readFileSync(path.join(dataDir, "movie.yaml"), "utf8"),
  ) as { acts: { id: number; scenes: string[] }[] };
  return raw.acts;
}

describe("applyReorderScene — move within an act", () => {
  it("moves a Scene one step earlier (direction=up) and persists the manifest", async () => {
    writeScene("s01-a");
    writeScene("s02-b");
    writeScene("s03-c");
    // Migration → all three in act 1, folder-slug order.
    const project = await loadProject(dataDir);
    const arrangement = await loadArrangement(dataDir);

    const result = await applyReorderScene({
      project,
      arrangement,
      sceneSlug: "s03-c",
      direction: "up",
      dataDir,
      saveArrangement,
      loadProject,
    });

    // In-memory project + arrangement reflect the move.
    expect(result.arrangement.scenesInAct(1)).toEqual([
      "s01-a",
      "s03-c",
      "s02-b",
    ]);
    expect(result.project.scenes.map((s) => s.slug)).toEqual([
      "s01-a",
      "s03-c",
      "s02-b",
    ]);

    // Manifest persisted on disk.
    const acts = readManifestActs();
    expect(acts[0]!.scenes).toEqual(["s01-a", "s03-c", "s02-b"]);

    // Reload from disk keeps the new order (refresh survives).
    const reloaded = await loadProject(dataDir);
    expect(reloaded.scenes.map((s) => s.slug)).toEqual([
      "s01-a",
      "s03-c",
      "s02-b",
    ]);
  });

  it("moves a Scene one step later (direction=down)", async () => {
    writeScene("s01-a");
    writeScene("s02-b");
    writeScene("s03-c");
    const project = await loadProject(dataDir);
    const arrangement = await loadArrangement(dataDir);

    const result = await applyReorderScene({
      project,
      arrangement,
      sceneSlug: "s01-a",
      direction: "down",
      dataDir,
      saveArrangement,
      loadProject,
    });

    expect(result.arrangement.scenesInAct(1)).toEqual([
      "s02-b",
      "s01-a",
      "s03-c",
    ]);
  });

  it("is a no-op when moving the first Scene up (clamped, stays put)", async () => {
    writeScene("s01-a");
    writeScene("s02-b");
    const project = await loadProject(dataDir);
    const arrangement = await loadArrangement(dataDir);

    const result = await applyReorderScene({
      project,
      arrangement,
      sceneSlug: "s01-a",
      direction: "up",
      dataDir,
      saveArrangement,
      loadProject,
    });

    expect(result.arrangement.scenesInAct(1)).toEqual(["s01-a", "s02-b"]);
  });

  it("is a no-op when moving the last Scene down (clamped, stays put)", async () => {
    writeScene("s01-a");
    writeScene("s02-b");
    const project = await loadProject(dataDir);
    const arrangement = await loadArrangement(dataDir);

    const result = await applyReorderScene({
      project,
      arrangement,
      sceneSlug: "s02-b",
      direction: "down",
      dataDir,
      saveArrangement,
      loadProject,
    });

    expect(result.arrangement.scenesInAct(1)).toEqual(["s01-a", "s02-b"]);
  });

  it("stays within its own act — never crosses an act boundary (that's #21)", async () => {
    writeScene("s01-a");
    writeScene("s02-b");
    // s01-a alone in act 1; moving it down must NOT spill into act 2.
    writeManifest(`
acts:
  - id: 1
    scenes: [s01-a]
  - id: 2
    scenes: [s02-b]
  - id: 3
    scenes: []
`);
    const project = await loadProject(dataDir);
    const arrangement = await loadArrangement(dataDir);

    const result = await applyReorderScene({
      project,
      arrangement,
      sceneSlug: "s01-a",
      direction: "down",
      dataDir,
      saveArrangement,
      loadProject,
    });

    // Clamped at the end of act 1 — still in act 1.
    expect(result.arrangement.scenesInAct(1)).toEqual(["s01-a"]);
    expect(result.arrangement.scenesInAct(2)).toEqual(["s02-b"]);
  });

  it("reorders a non-starred Scene too (it keeps its manifest slot)", async () => {
    writeScene("s01-a", true);
    writeScene("s02-b", false);
    writeScene("s03-c", true);
    const project = await loadProject(dataDir);
    const arrangement = await loadArrangement(dataDir);

    const result = await applyReorderScene({
      project,
      arrangement,
      sceneSlug: "s02-b",
      direction: "up",
      dataDir,
      saveArrangement,
      loadProject,
    });

    // Non-starred s02-b moved within the manifest even though it's not in the
    // visible movie sequence.
    expect(result.arrangement.scenesInAct(1)).toEqual([
      "s02-b",
      "s01-a",
      "s03-c",
    ]);
  });
});

describe("applyReorderScene — validation", () => {
  it("rejects an unknown Scene slug", async () => {
    writeScene("s01-a");
    const project = await loadProject(dataDir);
    const arrangement = await loadArrangement(dataDir);
    await expect(
      applyReorderScene({
        project,
        arrangement,
        sceneSlug: "ghost",
        direction: "up",
        dataDir,
        saveArrangement,
        loadProject,
      }),
    ).rejects.toThrow(ReorderError);
  });
});
