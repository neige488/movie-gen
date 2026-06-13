/**
 * Shot edit handler — integration tests against real temp `data/`.
 *
 * Five orchestrators share this module (Slice 7 — Shot meta edit):
 *  - applyShotPromptEdit
 *  - applyShotDurationEdit
 *  - applyShotCharacterRefsEdit
 *  - applyShotLocationRefsEdit
 *  - applyShotPropRefsEdit
 *
 * All five mutate via the corresponding domain function, persist shots.yaml,
 * and return the rebuilt Project (mirrors acknowledge-handler / starred-toggle
 * handler patterns).
 *
 * Tests exercise the public surface: edit one field, reload from disk, assert
 * the new value survived and others didn't change.
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
import { saveSceneShots } from "@adapter/project-writer.js";
import { createProject } from "@domain/movie.js";
import {
  applyShotPromptEdit,
  applyShotDurationEdit,
  applyShotCharacterRefsEdit,
  applyShotLocationRefsEdit,
  applyShotPrevShotRefEdit,
  applyShotPropRefsEdit,
  ShotEditError,
} from "./shot-edit-handler.js";

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "moviegen-shotedit-"));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

/**
 * Write the minimal Project layout a test needs — one scene with one shot,
 * plus optional Character/Location/Prop yamls so the loaded Project can carry
 * the matching refs.
 */
function writeMinimalProject(opts?: {
  shotPrompt?: string;
  shotDuration?: number;
  withCharacter?: boolean; // adds character-a with look "look1"
  withLocation?: boolean; // adds location "room"
  withProp?: boolean; // adds prop "lamp"
  characterRefs?: { character: string; look: string }[];
  locationRefs?: { location: string; reference?: string }[];
  propRefs?: { prop: string; reference?: string }[];
}): void {
  const sceneDir = path.join(dataDir, "scenes", "s01-open");
  mkdirSync(sceneDir, { recursive: true });

  writeFileSync(
    path.join(sceneDir, "scene.yaml"),
    `slugline: "INT. ROOM - DAY"\nisStarred: true\n`,
  );
  writeFileSync(
    path.join(sceneDir, "screenplay.md"),
    `<!-- shot:01 -->\nbody\n<!-- /shot:01 -->\n`,
  );

  const shotsPayload = {
    shots: [
      {
        id: "01",
        prompt: opts?.shotPrompt ?? "original prompt",
        duration: opts?.shotDuration ?? 5,
        screenplayHash: "deadbeef",
        characterRefs: opts?.characterRefs ?? [],
        locationRefs: opts?.locationRefs ?? [],
        propRefs: opts?.propRefs ?? [],
        takes: [],
      },
    ],
  };
  writeFileSync(
    path.join(sceneDir, "shots.yaml"),
    yaml.dump(shotsPayload, { lineWidth: 120 }),
  );

  if (opts?.withCharacter) {
    const charDir = path.join(dataDir, "characters");
    mkdirSync(charDir, { recursive: true });
    writeFileSync(
      path.join(charDir, "character-a.yaml"),
      yaml.dump({
        name: "character-a",
        headshot: "character-a/headshot.png",
        looks: [
          {
            name: "look1",
            faceImage: "f.png",
            bodyImage: "b.png",
          },
        ],
      }),
    );
  }
  if (opts?.withLocation) {
    const locDir = path.join(dataDir, "locations");
    mkdirSync(locDir, { recursive: true });
    writeFileSync(
      path.join(locDir, "room.yaml"),
      yaml.dump({ name: "room", references: [] }),
    );
  }
  if (opts?.withProp) {
    const propDir = path.join(dataDir, "props");
    mkdirSync(propDir, { recursive: true });
    writeFileSync(
      path.join(propDir, "lamp.yaml"),
      yaml.dump({ name: "lamp", references: [] }),
    );
  }
}

// ---------------------------------------------------------------------------
// applyShotPromptEdit
// ---------------------------------------------------------------------------

describe("applyShotPromptEdit", () => {
  it("updates prompt in memory and on disk", async () => {
    writeMinimalProject({ shotPrompt: "old" });
    const project = await loadProject(dataDir);

    const result = await applyShotPromptEdit({
      project,
      sceneSlug: "s01-open",
      shotId: "01",
      prompt: "new prompt text",
      dataDir,
      saveSceneShots,
      createProject,
    });

    expect(result.project.scenes[0]!.shots[0]!.prompt).toBe("new prompt text");

    // Disk round-trip
    const reloaded = await loadProject(dataDir);
    expect(reloaded.scenes[0]!.shots[0]!.prompt).toBe("new prompt text");
  });

  it("rejects empty prompt as 400-style ShotEditError", async () => {
    writeMinimalProject();
    const project = await loadProject(dataDir);
    await expect(
      applyShotPromptEdit({
        project,
        sceneSlug: "s01-open",
        shotId: "01",
        prompt: "",
        dataDir,
        saveSceneShots,
        createProject,
      }),
    ).rejects.toBeInstanceOf(ShotEditError);
  });

  it("rejects unknown Shot id", async () => {
    writeMinimalProject();
    const project = await loadProject(dataDir);
    await expect(
      applyShotPromptEdit({
        project,
        sceneSlug: "s01-open",
        shotId: "99",
        prompt: "x",
        dataDir,
        saveSceneShots,
        createProject,
      }),
    ).rejects.toBeInstanceOf(ShotEditError);
  });
});

// ---------------------------------------------------------------------------
// applyShotDurationEdit
// ---------------------------------------------------------------------------

describe("applyShotDurationEdit", () => {
  it("updates duration in memory and on disk", async () => {
    writeMinimalProject({ shotDuration: 5 });
    const project = await loadProject(dataDir);

    const result = await applyShotDurationEdit({
      project,
      sceneSlug: "s01-open",
      shotId: "01",
      duration: 12,
      dataDir,
      saveSceneShots,
      createProject,
    });

    expect(result.project.scenes[0]!.shots[0]!.duration).toBe(12);
    const reloaded = await loadProject(dataDir);
    expect(reloaded.scenes[0]!.shots[0]!.duration).toBe(12);
  });

  it("rejects duration of 3 (below domain min)", async () => {
    writeMinimalProject();
    const project = await loadProject(dataDir);
    await expect(
      applyShotDurationEdit({
        project,
        sceneSlug: "s01-open",
        shotId: "01",
        duration: 3,
        dataDir,
        saveSceneShots,
        createProject,
      }),
    ).rejects.toBeInstanceOf(ShotEditError);
  });

  it("rejects duration of 16 (above domain max)", async () => {
    writeMinimalProject();
    const project = await loadProject(dataDir);
    await expect(
      applyShotDurationEdit({
        project,
        sceneSlug: "s01-open",
        shotId: "01",
        duration: 16,
        dataDir,
        saveSceneShots,
        createProject,
      }),
    ).rejects.toBeInstanceOf(ShotEditError);
  });
});

// ---------------------------------------------------------------------------
// applyShotCharacterRefsEdit
// ---------------------------------------------------------------------------

describe("applyShotCharacterRefsEdit", () => {
  it("adds refs and persists", async () => {
    writeMinimalProject({ withCharacter: true });
    const project = await loadProject(dataDir);

    const result = await applyShotCharacterRefsEdit({
      project,
      sceneSlug: "s01-open",
      shotId: "01",
      refs: [{ character: "character-a", look: "look1" }],
      dataDir,
      saveSceneShots,
      createProject,
    });

    expect(result.project.scenes[0]!.shots[0]!.characterRefs).toEqual([
      { character: "character-a", look: "look1" },
    ]);
    const reloaded = await loadProject(dataDir);
    expect(reloaded.scenes[0]!.shots[0]!.characterRefs).toEqual([
      { character: "character-a", look: "look1" },
    ]);
  });

  it("rejects ref to unknown Character", async () => {
    writeMinimalProject({ withCharacter: true });
    const project = await loadProject(dataDir);
    await expect(
      applyShotCharacterRefsEdit({
        project,
        sceneSlug: "s01-open",
        shotId: "01",
        refs: [{ character: "ghost", look: "look1" }],
        dataDir,
        saveSceneShots,
        createProject,
      }),
    ).rejects.toBeInstanceOf(ShotEditError);
  });

  it("rejects ref to unknown Look", async () => {
    writeMinimalProject({ withCharacter: true });
    const project = await loadProject(dataDir);
    await expect(
      applyShotCharacterRefsEdit({
        project,
        sceneSlug: "s01-open",
        shotId: "01",
        refs: [{ character: "character-a", look: "ghostLook" }],
        dataDir,
        saveSceneShots,
        createProject,
      }),
    ).rejects.toBeInstanceOf(ShotEditError);
  });
});

// ---------------------------------------------------------------------------
// applyShotLocationRefsEdit
// ---------------------------------------------------------------------------

describe("applyShotLocationRefsEdit", () => {
  it("adds refs and persists", async () => {
    writeMinimalProject({ withLocation: true });
    const project = await loadProject(dataDir);

    const result = await applyShotLocationRefsEdit({
      project,
      sceneSlug: "s01-open",
      shotId: "01",
      refs: [{ location: "room", reference: "wide" }],
      dataDir,
      saveSceneShots,
      createProject,
    });

    expect(result.project.scenes[0]!.shots[0]!.locationRefs).toEqual([
      { location: "room", reference: "wide" },
    ]);
  });

  it("rejects ref to unknown Location", async () => {
    writeMinimalProject({ withLocation: true });
    const project = await loadProject(dataDir);
    await expect(
      applyShotLocationRefsEdit({
        project,
        sceneSlug: "s01-open",
        shotId: "01",
        refs: [{ location: "ghost" }],
        dataDir,
        saveSceneShots,
        createProject,
      }),
    ).rejects.toBeInstanceOf(ShotEditError);
  });
});

// ---------------------------------------------------------------------------
// applyShotPropRefsEdit
// ---------------------------------------------------------------------------

describe("applyShotPropRefsEdit", () => {
  it("adds refs and persists", async () => {
    writeMinimalProject({ withProp: true });
    const project = await loadProject(dataDir);

    const result = await applyShotPropRefsEdit({
      project,
      sceneSlug: "s01-open",
      shotId: "01",
      refs: [{ prop: "lamp" }],
      dataDir,
      saveSceneShots,
      createProject,
    });

    expect(result.project.scenes[0]!.shots[0]!.propRefs).toEqual([
      { prop: "lamp" },
    ]);
  });

  it("rejects ref to unknown Prop", async () => {
    writeMinimalProject({ withProp: true });
    const project = await loadProject(dataDir);
    await expect(
      applyShotPropRefsEdit({
        project,
        sceneSlug: "s01-open",
        shotId: "01",
        refs: [{ prop: "ghost" }],
        dataDir,
        saveSceneShots,
        createProject,
      }),
    ).rejects.toBeInstanceOf(ShotEditError);
  });
});

// ---------------------------------------------------------------------------
// applyShotPrevShotRefEdit — Slice 8 (Chaining)
//
// Writes a 2-shot scene so we can set prevShotRef on Shot 02 → Shot 01.
// ---------------------------------------------------------------------------

function writeTwoShotProject(opts?: { prevShotRefOnTwo?: string }): void {
  const sceneDir = path.join(dataDir, "scenes", "s01-open");
  mkdirSync(sceneDir, { recursive: true });
  writeFileSync(
    path.join(sceneDir, "scene.yaml"),
    `slugline: "INT. ROOM - DAY"\nisStarred: true\n`,
  );
  writeFileSync(
    path.join(sceneDir, "screenplay.md"),
    `<!-- shot:01 -->\na\n<!-- /shot:01 -->\n<!-- shot:02 -->\nb\n<!-- /shot:02 -->\n`,
  );
  const shot1: Record<string, unknown> = {
    id: "01",
    prompt: "first",
    duration: 5,
    screenplayHash: "deadbeef",
    characterRefs: [],
    locationRefs: [],
    propRefs: [],
    takes: [],
  };
  const shot2: Record<string, unknown> = {
    id: "02",
    prompt: "second",
    duration: 5,
    screenplayHash: "deadbeef",
    characterRefs: [],
    locationRefs: [],
    propRefs: [],
    takes: [],
  };
  if (opts?.prevShotRefOnTwo) shot2.prevShotRef = opts.prevShotRefOnTwo;
  writeFileSync(
    path.join(sceneDir, "shots.yaml"),
    yaml.dump({ shots: [shot1, shot2] }, { lineWidth: 120 }),
  );
}

describe("applyShotPrevShotRefEdit", () => {
  it("sets prevShotRef to an earlier Shot id and persists", async () => {
    writeTwoShotProject();
    const project = await loadProject(dataDir);

    const result = await applyShotPrevShotRefEdit({
      project,
      sceneSlug: "s01-open",
      shotId: "02",
      prevShotRef: "01",
      dataDir,
      saveSceneShots,
      createProject,
    });

    expect(result.project.scenes[0]!.shots[1]!.prevShotRef).toBe("01");

    const reloaded = await loadProject(dataDir);
    expect(reloaded.scenes[0]!.shots[1]!.prevShotRef).toBe("01");
  });

  it("clears prevShotRef with null", async () => {
    writeTwoShotProject({ prevShotRefOnTwo: "01" });
    const project = await loadProject(dataDir);

    const result = await applyShotPrevShotRefEdit({
      project,
      sceneSlug: "s01-open",
      shotId: "02",
      prevShotRef: null,
      dataDir,
      saveSceneShots,
      createProject,
    });

    expect(result.project.scenes[0]!.shots[1]!.prevShotRef).toBeUndefined();

    const reloaded = await loadProject(dataDir);
    expect(reloaded.scenes[0]!.shots[1]!.prevShotRef).toBeUndefined();
  });

  it("rejects forward ref (later Shot in same Scene)", async () => {
    writeTwoShotProject();
    const project = await loadProject(dataDir);
    await expect(
      applyShotPrevShotRefEdit({
        project,
        sceneSlug: "s01-open",
        shotId: "01",
        prevShotRef: "02",
        dataDir,
        saveSceneShots,
        createProject,
      }),
    ).rejects.toBeInstanceOf(ShotEditError);
  });

  it("rejects self ref", async () => {
    writeTwoShotProject();
    const project = await loadProject(dataDir);
    await expect(
      applyShotPrevShotRefEdit({
        project,
        sceneSlug: "s01-open",
        shotId: "02",
        prevShotRef: "02",
        dataDir,
        saveSceneShots,
        createProject,
      }),
    ).rejects.toBeInstanceOf(ShotEditError);
  });

  it("rejects unknown prevShotRef id", async () => {
    writeTwoShotProject();
    const project = await loadProject(dataDir);
    await expect(
      applyShotPrevShotRefEdit({
        project,
        sceneSlug: "s01-open",
        shotId: "02",
        prevShotRef: "ghost",
        dataDir,
        saveSceneShots,
        createProject,
      }),
    ).rejects.toBeInstanceOf(ShotEditError);
  });

  it("rejects unknown Shot id (target)", async () => {
    writeTwoShotProject();
    const project = await loadProject(dataDir);
    await expect(
      applyShotPrevShotRefEdit({
        project,
        sceneSlug: "s01-open",
        shotId: "99",
        prevShotRef: "01",
        dataDir,
        saveSceneShots,
        createProject,
      }),
    ).rejects.toBeInstanceOf(ShotEditError);
  });

  it("preserves other Shot fields on update", async () => {
    writeTwoShotProject();
    const project = await loadProject(dataDir);
    const before = project.scenes[0]!.shots[1]!;

    const result = await applyShotPrevShotRefEdit({
      project,
      sceneSlug: "s01-open",
      shotId: "02",
      prevShotRef: "01",
      dataDir,
      saveSceneShots,
      createProject,
    });

    const after = result.project.scenes[0]!.shots[1]!;
    expect(after.id).toBe(before.id);
    expect(after.prompt).toBe(before.prompt);
    expect(after.duration).toBe(before.duration);
    expect(after.screenplayHash).toBe(before.screenplayHash);
  });
});
