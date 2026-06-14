/**
 * applyMoveScene — integration tests against real temp data/ (BS2 canvas drag,
 * slice #21).
 *
 * Unlike applyReorderScene (Scenes-view ▲/▼, same-act one-step), this is the
 * canvas drag entry point: it moves a Scene to an arbitrary act + visible drop
 * position via `MovieArrangement.moveScene`, rewrites data/movie.yaml
 * atomically, and rebuilds the in-memory Project so the new placement survives
 * a refresh. Mirrors reorder-handler.test.ts.
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
import { applyMoveScene, MoveSceneError } from "./move-scene-handler.js";

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "moviegen-move-"));
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

describe("applyMoveScene — cross-act drag", () => {
  it("moves a Scene from act 1 to act 3 (end of the visible row) and persists", async () => {
    // Migration clusters all three into act 1.
    writeScene("s01-a");
    writeScene("s02-b");
    writeScene("s03-c");
    const project = await loadProject(dataDir);
    const arrangement = await loadArrangement(dataDir);

    const result = await applyMoveScene({
      project,
      arrangement,
      sceneSlug: "s02-b",
      toActId: 3,
      beforeSlug: null, // dropped at the end of the (empty) act-3 row
      dataDir,
      saveArrangement,
      loadProject,
    });

    expect(result.arrangement.scenesInAct(1)).toEqual(["s01-a", "s03-c"]);
    expect(result.arrangement.scenesInAct(3)).toEqual(["s02-b"]);

    // Manifest persisted; act3 reflects the move.
    const acts = readManifestActs();
    expect(acts[0]!.scenes).toEqual(["s01-a", "s03-c"]);
    expect(acts[2]!.scenes).toEqual(["s02-b"]);

    // Reload from disk keeps the new placement (refresh survives).
    const reloaded = await loadArrangement(dataDir);
    expect(reloaded.scenesInAct(3)).toEqual(["s02-b"]);
  });

  it("drops before a visible anchor in the target act", async () => {
    writeScene("s01-a");
    writeScene("s02-b");
    writeScene("s03-c");
    writeManifest(`
acts:
  - id: 1
    scenes: [s01-a]
  - id: 2
    scenes: [s02-b, s03-c]
  - id: 3
    scenes: []
`);
    const project = await loadProject(dataDir);
    const arrangement = await loadArrangement(dataDir);

    // Drag s01-a into act 2, dropping it BEFORE s03-c.
    const result = await applyMoveScene({
      project,
      arrangement,
      sceneSlug: "s01-a",
      toActId: 2,
      beforeSlug: "s03-c",
      dataDir,
      saveArrangement,
      loadProject,
    });

    expect(result.arrangement.scenesInAct(1)).toEqual([]);
    expect(result.arrangement.scenesInAct(2)).toEqual([
      "s02-b",
      "s01-a",
      "s03-c",
    ]);
  });

  it("reorders within the same act when target act == source act", async () => {
    writeScene("s01-a");
    writeScene("s02-b");
    writeScene("s03-c");
    // All in act 1.
    const project = await loadProject(dataDir);
    const arrangement = await loadArrangement(dataDir);

    // Drag s03-c to before s01-a (front of act 1).
    const result = await applyMoveScene({
      project,
      arrangement,
      sceneSlug: "s03-c",
      toActId: 1,
      beforeSlug: "s01-a",
      dataDir,
      saveArrangement,
      loadProject,
    });

    expect(result.arrangement.scenesInAct(1)).toEqual([
      "s03-c",
      "s01-a",
      "s02-b",
    ]);
    // Linear sequence reflects the within-act reorder.
    expect(result.project.scenes.map((s) => s.slug)).toEqual([
      "s03-c",
      "s01-a",
      "s02-b",
    ]);
  });

  it("lands before the anchor on a FORWARD same-act drag (remove-then-insert shift)", async () => {
    // All four in act 1. Drag s01-a forward to BEFORE s03-c. The director's
    // intent is [s02-b, s01-a, s03-c, s04-d]; without shift compensation the
    // block would overshoot to AFTER s03-c.
    writeScene("s01-a");
    writeScene("s02-b");
    writeScene("s03-c");
    writeScene("s04-d");
    const project = await loadProject(dataDir);
    const arrangement = await loadArrangement(dataDir);

    const result = await applyMoveScene({
      project,
      arrangement,
      sceneSlug: "s01-a",
      toActId: 1,
      beforeSlug: "s03-c",
      dataDir,
      saveArrangement,
      loadProject,
    });

    expect(result.arrangement.scenesInAct(1)).toEqual([
      "s02-b",
      "s01-a",
      "s03-c",
      "s04-d",
    ]);
  });

  it("keeps an interleaved non-starred Scene in its relative slot on a row-end drop", async () => {
    writeScene("s01-a", true);
    writeScene("s02-n", false); // non-starred — invisible on the canvas
    writeScene("s03-c", true);
    writeManifest(`
acts:
  - id: 1
    scenes: [s01-a, s02-n, s03-c]
  - id: 2
    scenes: []
  - id: 3
    scenes: []
`);
    const project = await loadProject(dataDir);
    const arrangement = await loadArrangement(dataDir);

    // Drag the act-2 ... actually drag s01-a from act 1 to act 2 end, then drag
    // it back to act-1 row end: it should land after the last STARRED slug
    // (s03-c), before any trailing non-starred — but here non-starred s02-n is
    // in the middle, so row-end is just after s03-c (index 3).
    const moved = await applyMoveScene({
      project,
      arrangement,
      sceneSlug: "s01-a",
      toActId: 1,
      beforeSlug: null, // row end of act 1
      dataDir,
      saveArrangement,
      loadProject,
    });

    // s01-a removed from front, re-inserted at the visible-row end (after the
    // last starred s03-c). Non-starred s02-n keeps its relative slot.
    expect(moved.arrangement.scenesInAct(1)).toEqual([
      "s02-n",
      "s03-c",
      "s01-a",
    ]);
  });
});

describe("applyMoveScene — validation", () => {
  it("rejects an unknown Scene slug", async () => {
    writeScene("s01-a");
    const project = await loadProject(dataDir);
    const arrangement = await loadArrangement(dataDir);
    await expect(
      applyMoveScene({
        project,
        arrangement,
        sceneSlug: "ghost",
        toActId: 2,
        beforeSlug: null,
        dataDir,
        saveArrangement,
        loadProject,
      }),
    ).rejects.toThrow(MoveSceneError);
  });

  it("rejects an invalid act id", async () => {
    writeScene("s01-a");
    const project = await loadProject(dataDir);
    const arrangement = await loadArrangement(dataDir);
    await expect(
      applyMoveScene({
        project,
        arrangement,
        sceneSlug: "s01-a",
        // @ts-expect-error — deliberately invalid act id for the rejection path
        toActId: 9,
        beforeSlug: null,
        dataDir,
        saveArrangement,
        loadProject,
      }),
    ).rejects.toThrow(MoveSceneError);
  });

  it("rejects a drop anchor that is not in the target act", async () => {
    writeScene("s01-a");
    writeScene("s02-b");
    const project = await loadProject(dataDir);
    const arrangement = await loadArrangement(dataDir);
    await expect(
      applyMoveScene({
        project,
        arrangement,
        sceneSlug: "s01-a",
        toActId: 2,
        beforeSlug: "s02-b", // s02-b is in act 1, not act 2
        dataDir,
        saveArrangement,
        loadProject,
      }),
    ).rejects.toThrow(MoveSceneError);
  });
});
