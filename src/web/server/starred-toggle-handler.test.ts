/**
 * Starred toggle handler — integration tests against real temp data/.
 *
 * Two operations share the same module:
 *   - applyToggleSceneStarred → scene.yaml.isStarred flip + saveSceneFile
 *   - applyToggleTakeStarred  → shots.yaml take.isStarred flip + Shot-level
 *                               invariant enforcement (auto-OFF sibling)
 *
 * Both rebuild the in-memory Project so subsequent /api/movie reads see the
 * new state.
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
import { loadProject } from "@adapter/project-repository.js";
import {
  saveSceneFile,
  saveSceneShots,
} from "@adapter/project-writer.js";
import { createProject, movieSequence } from "@domain/movie.js";
import {
  applyToggleSceneStarred,
  applyToggleTakeStarred,
  StarredToggleError,
} from "./starred-toggle-handler.js";

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "moviegen-starred-"));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

function writeScene(opts: {
  slug: string;
  isStarred: boolean;
  takes?: string;
}): void {
  const sceneDir = path.join(dataDir, "scenes", opts.slug);
  mkdirSync(sceneDir, { recursive: true });
  writeFileSync(
    path.join(sceneDir, "scene.yaml"),
    `slugline: "INT. ${opts.slug.toUpperCase()} - DAY"\nisStarred: ${opts.isStarred}\n`,
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
      opts.takes ?? `    takes: []`,
      ``,
    ].join("\n"),
  );
}

describe("applyToggleSceneStarred — happy path", () => {
  it("flips isStarred=true on a Scene and persists scene.yaml", async () => {
    writeScene({ slug: "s01-open", isStarred: false });
    const project = await loadProject(dataDir);
    expect(project.scenes[0]!.isStarred).toBe(false);

    const result = await applyToggleSceneStarred({
      project,
      sceneSlug: "s01-open",
      isStarred: true,
      dataDir,
      saveSceneFile,
      createProject,
    });

    // In-memory project updated.
    expect(result.project.scenes[0]!.isStarred).toBe(true);
    // YAML persisted.
    const yamlText = readFileSync(
      path.join(dataDir, "scenes", "s01-open", "scene.yaml"),
      "utf8",
    );
    expect(yamlText).toMatch(/isStarred:\s*true/);
    // Reload from disk picks it up.
    const reloaded = await loadProject(dataDir);
    expect(reloaded.scenes[0]!.isStarred).toBe(true);
  });

  it("flips isStarred=false (removes Scene from movie sequence)", async () => {
    writeScene({ slug: "s01-a", isStarred: true });
    writeScene({ slug: "s02-b", isStarred: true });
    const project = await loadProject(dataDir);
    expect(movieSequence(project).map((s) => s.slug)).toEqual([
      "s01-a",
      "s02-b",
    ]);

    const result = await applyToggleSceneStarred({
      project,
      sceneSlug: "s01-a",
      isStarred: false,
      dataDir,
      saveSceneFile,
      createProject,
    });

    expect(movieSequence(result.project).map((s) => s.slug)).toEqual([
      "s02-b",
    ]);
  });

  it("does not touch screenplay.md or shots.yaml", async () => {
    writeScene({ slug: "s01-open", isStarred: true });
    const project = await loadProject(dataDir);

    const screenplayBefore = readFileSync(
      path.join(dataDir, "scenes", "s01-open", "screenplay.md"),
      "utf8",
    );
    const shotsBefore = readFileSync(
      path.join(dataDir, "scenes", "s01-open", "shots.yaml"),
      "utf8",
    );

    await applyToggleSceneStarred({
      project,
      sceneSlug: "s01-open",
      isStarred: false,
      dataDir,
      saveSceneFile,
      createProject,
    });

    expect(
      readFileSync(
        path.join(dataDir, "scenes", "s01-open", "screenplay.md"),
        "utf8",
      ),
    ).toBe(screenplayBefore);
    expect(
      readFileSync(
        path.join(dataDir, "scenes", "s01-open", "shots.yaml"),
        "utf8",
      ),
    ).toBe(shotsBefore);
  });
});

describe("applyToggleSceneStarred — validation", () => {
  it("rejects unknown Scene", async () => {
    writeScene({ slug: "s01-open", isStarred: false });
    const project = await loadProject(dataDir);
    await expect(
      applyToggleSceneStarred({
        project,
        sceneSlug: "ghost",
        isStarred: true,
        dataDir,
        saveSceneFile,
        createProject,
      }),
    ).rejects.toThrow(StarredToggleError);
  });
});

describe("applyToggleTakeStarred — happy path", () => {
  const TAKES_WITH_THREE = [
    `    takes:`,
    `      - id: take-001`,
    `        videoPath: videos/s01-open/01/take-001.mp4`,
    `        screenplayHash: h`,
    `        createdAt: "2026-06-01T00:00:00.000Z"`,
    `        isStarred: false`,
    `      - id: take-002`,
    `        videoPath: videos/s01-open/01/take-002.mp4`,
    `        screenplayHash: h`,
    `        createdAt: "2026-06-01T00:01:00.000Z"`,
    `        isStarred: false`,
    `      - id: take-003`,
    `        videoPath: videos/s01-open/01/take-003.mp4`,
    `        screenplayHash: h`,
    `        createdAt: "2026-06-01T00:02:00.000Z"`,
    `        isStarred: false`,
  ].join("\n");

  it("turns ON a Take's isStarred and persists shots.yaml", async () => {
    writeScene({
      slug: "s01-open",
      isStarred: true,
      takes: TAKES_WITH_THREE,
    });
    const project = await loadProject(dataDir);

    const result = await applyToggleTakeStarred({
      project,
      sceneSlug: "s01-open",
      shotId: "01",
      takeId: "take-002",
      isStarred: true,
      dataDir,
      saveSceneShots,
      createProject,
    });

    // In-memory project — invariant holds.
    const takes = result.project.scenes[0]!.shots[0]!.takes;
    expect(takes.find((t) => t.id === "take-002")!.isStarred).toBe(true);
    expect(takes.filter((t) => t.isStarred)).toHaveLength(1);

    // YAML persisted.
    const reloaded = await loadProject(dataDir);
    const reloadedTakes = reloaded.scenes[0]!.shots[0]!.takes;
    expect(reloadedTakes.find((t) => t.id === "take-002")!.isStarred).toBe(
      true,
    );
    expect(reloadedTakes.filter((t) => t.isStarred)).toHaveLength(1);
  });

  it("auto-OFFs the previously starred Take when a different Take is starred", async () => {
    const takesWithT1Starred = [
      `    takes:`,
      `      - id: take-001`,
      `        videoPath: videos/s01-open/01/take-001.mp4`,
      `        screenplayHash: h`,
      `        createdAt: "2026-06-01T00:00:00.000Z"`,
      `        isStarred: true`,
      `      - id: take-002`,
      `        videoPath: videos/s01-open/01/take-002.mp4`,
      `        screenplayHash: h`,
      `        createdAt: "2026-06-01T00:01:00.000Z"`,
      `        isStarred: false`,
    ].join("\n");
    writeScene({
      slug: "s01-open",
      isStarred: true,
      takes: takesWithT1Starred,
    });
    const project = await loadProject(dataDir);
    expect(
      project.scenes[0]!.shots[0]!.takes.find((t) => t.id === "take-001")!
        .isStarred,
    ).toBe(true);

    const result = await applyToggleTakeStarred({
      project,
      sceneSlug: "s01-open",
      shotId: "01",
      takeId: "take-002",
      isStarred: true,
      dataDir,
      saveSceneShots,
      createProject,
    });

    // In-memory: t01 now OFF, t02 ON.
    const takes = result.project.scenes[0]!.shots[0]!.takes;
    expect(takes.find((t) => t.id === "take-001")!.isStarred).toBe(false);
    expect(takes.find((t) => t.id === "take-002")!.isStarred).toBe(true);

    // YAML persisted: the auto-OFF must be written too, not only in memory.
    const reloaded = await loadProject(dataDir);
    const reTakes = reloaded.scenes[0]!.shots[0]!.takes;
    expect(reTakes.find((t) => t.id === "take-001")!.isStarred).toBe(false);
    expect(reTakes.find((t) => t.id === "take-002")!.isStarred).toBe(true);
  });

  it("turns OFF the currently starred Take (zero starred after)", async () => {
    const takesWithT1Starred = [
      `    takes:`,
      `      - id: take-001`,
      `        videoPath: videos/s01-open/01/take-001.mp4`,
      `        screenplayHash: h`,
      `        createdAt: "2026-06-01T00:00:00.000Z"`,
      `        isStarred: true`,
    ].join("\n");
    writeScene({
      slug: "s01-open",
      isStarred: true,
      takes: takesWithT1Starred,
    });
    const project = await loadProject(dataDir);

    const result = await applyToggleTakeStarred({
      project,
      sceneSlug: "s01-open",
      shotId: "01",
      takeId: "take-001",
      isStarred: false,
      dataDir,
      saveSceneShots,
      createProject,
    });

    const reloaded = await loadProject(dataDir);
    expect(
      reloaded.scenes[0]!.shots[0]!.takes.find((t) => t.id === "take-001")!
        .isStarred,
    ).toBe(false);
    expect(
      result.project.scenes[0]!.shots[0]!.takes.every((t) => !t.isStarred),
    ).toBe(true);
  });
});

describe("applyToggleTakeStarred — validation", () => {
  const TAKES_BASIC = [
    `    takes:`,
    `      - id: take-001`,
    `        videoPath: v/take-001.mp4`,
    `        screenplayHash: h`,
    `        createdAt: "2026-06-01T00:00:00.000Z"`,
    `        isStarred: false`,
  ].join("\n");

  it("rejects unknown Scene", async () => {
    writeScene({ slug: "s01-open", isStarred: true, takes: TAKES_BASIC });
    const project = await loadProject(dataDir);
    await expect(
      applyToggleTakeStarred({
        project,
        sceneSlug: "ghost",
        shotId: "01",
        takeId: "take-001",
        isStarred: true,
        dataDir,
        saveSceneShots,
        createProject,
      }),
    ).rejects.toThrow(StarredToggleError);
  });

  it("rejects unknown Shot", async () => {
    writeScene({ slug: "s01-open", isStarred: true, takes: TAKES_BASIC });
    const project = await loadProject(dataDir);
    await expect(
      applyToggleTakeStarred({
        project,
        sceneSlug: "s01-open",
        shotId: "99",
        takeId: "take-001",
        isStarred: true,
        dataDir,
        saveSceneShots,
        createProject,
      }),
    ).rejects.toThrow(StarredToggleError);
  });

  it("rejects unknown Take", async () => {
    writeScene({ slug: "s01-open", isStarred: true, takes: TAKES_BASIC });
    const project = await loadProject(dataDir);
    await expect(
      applyToggleTakeStarred({
        project,
        sceneSlug: "s01-open",
        shotId: "01",
        takeId: "ghost-take",
        isStarred: true,
        dataDir,
        saveSceneShots,
        createProject,
      }),
    ).rejects.toThrow(StarredToggleError);
  });
});
