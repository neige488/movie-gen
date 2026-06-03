/**
 * Light-edit handler — integration tests against real temp data/.
 *
 * Three orchestrators share this module (Slice 5):
 *  - applySluglineEdit   → scene.yaml only (saveSceneFile, setSceneSlugline)
 *  - applyScreenplayEdit → screenplay.md only (saveScreenplay) +
 *                          marker consistency validation (strict)
 *  - applySceneCopy      → clones folder via copyScene + reloads Project
 *                          so the in-memory state matches disk
 *
 * All three rebuild the in-memory Project so subsequent /api/movie reads see
 * the new state (mirrors starred-toggle-handler pattern).
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
} from "@adapter/project-writer.js";
import { saveScreenplay } from "@adapter/screenplay-writer.js";
import { copyScene } from "@adapter/scene-copier.js";
import { createProject } from "@domain/movie.js";
import {
  applySluglineEdit,
  applyScreenplayEdit,
  applySceneCopy,
  LightEditError,
} from "./light-edit-handler.js";

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "moviegen-lightedit-"));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

function writeScene(opts: {
  slug: string;
  isStarred: boolean;
  slugline?: string;
  shotIds?: readonly string[];
}): void {
  const sceneDir = path.join(dataDir, "scenes", opts.slug);
  mkdirSync(sceneDir, { recursive: true });
  writeFileSync(
    path.join(sceneDir, "scene.yaml"),
    `slugline: "${opts.slugline ?? "INT. ROOM - DAY"}"\nisStarred: ${opts.isStarred}\n`,
  );
  const shotIds = opts.shotIds ?? ["01"];
  const screenplay =
    shotIds
      .map((id) => `<!-- shot:${id} -->\nbody-${id}\n<!-- /shot:${id} -->`)
      .join("\n\n") + "\n";
  writeFileSync(path.join(sceneDir, "screenplay.md"), screenplay);
  const shotsBlock = shotIds
    .map((id) =>
      [
        `  - id: "${id}"`,
        `    prompt: "p"`,
        `    duration: 5`,
        `    screenplayHash: "h"`,
        `    characterRefs: []`,
        `    locationRefs: []`,
        `    propRefs: []`,
        `    takes: []`,
      ].join("\n"),
    )
    .join("\n");
  writeFileSync(
    path.join(sceneDir, "shots.yaml"),
    `shots:\n${shotsBlock}\n`,
  );
}

// ---------------------------------------------------------------------------
// applySluglineEdit
// ---------------------------------------------------------------------------

describe("applySluglineEdit — happy path", () => {
  it("updates slugline and persists scene.yaml", async () => {
    writeScene({
      slug: "s01-open",
      isStarred: true,
      slugline: "INT. ROOM - DAY",
    });
    const project = await loadProject(dataDir);

    const result = await applySluglineEdit({
      project,
      sceneSlug: "s01-open",
      slugline: "EXT. STREET - NIGHT",
      dataDir,
      saveSceneFile,
      createProject,
    });

    expect(result.project.scenes[0]!.slugline).toBe("EXT. STREET - NIGHT");
    const yamlText = readFileSync(
      path.join(dataDir, "scenes", "s01-open", "scene.yaml"),
      "utf8",
    );
    expect(yamlText).toMatch(/slugline:\s*['"]?EXT\. STREET - NIGHT['"]?/);

    // reload picks it up.
    const reloaded = await loadProject(dataDir);
    expect(reloaded.scenes[0]!.slugline).toBe("EXT. STREET - NIGHT");
  });

  it("does not touch screenplay.md or shots.yaml", async () => {
    writeScene({ slug: "s01-open", isStarred: true });
    const sceneDir = path.join(dataDir, "scenes", "s01-open");
    const screenplayBefore = readFileSync(
      path.join(sceneDir, "screenplay.md"),
      "utf8",
    );
    const shotsBefore = readFileSync(
      path.join(sceneDir, "shots.yaml"),
      "utf8",
    );
    const project = await loadProject(dataDir);

    await applySluglineEdit({
      project,
      sceneSlug: "s01-open",
      slugline: "EXT. NEW - DAY",
      dataDir,
      saveSceneFile,
      createProject,
    });

    expect(readFileSync(path.join(sceneDir, "screenplay.md"), "utf8")).toBe(
      screenplayBefore,
    );
    expect(readFileSync(path.join(sceneDir, "shots.yaml"), "utf8")).toBe(
      shotsBefore,
    );
  });
});

describe("applySluglineEdit — validation", () => {
  it("rejects unknown scene", async () => {
    writeScene({ slug: "s01-open", isStarred: true });
    const project = await loadProject(dataDir);
    await expect(
      applySluglineEdit({
        project,
        sceneSlug: "ghost",
        slugline: "X",
        dataDir,
        saveSceneFile,
        createProject,
      }),
    ).rejects.toThrow(LightEditError);
  });

  it("rejects empty slugline", async () => {
    writeScene({ slug: "s01-open", isStarred: true });
    const project = await loadProject(dataDir);
    await expect(
      applySluglineEdit({
        project,
        sceneSlug: "s01-open",
        slugline: "",
        dataDir,
        saveSceneFile,
        createProject,
      }),
    ).rejects.toThrow(LightEditError);
  });

  it("rejects whitespace-only slugline (after trim)", async () => {
    writeScene({ slug: "s01-open", isStarred: true });
    const project = await loadProject(dataDir);
    await expect(
      applySluglineEdit({
        project,
        sceneSlug: "s01-open",
        slugline: "   \t  ",
        dataDir,
        saveSceneFile,
        createProject,
      }),
    ).rejects.toThrow(LightEditError);
  });
});

// ---------------------------------------------------------------------------
// applyScreenplayEdit
// ---------------------------------------------------------------------------

describe("applyScreenplayEdit — happy path", () => {
  it("writes new screenplay.md when markers match shot ids exactly", async () => {
    writeScene({
      slug: "s01-open",
      isStarred: true,
      shotIds: ["01", "02"],
    });
    const project = await loadProject(dataDir);

    const newMd = [
      "Intro prose.",
      "",
      "<!-- shot:01 -->",
      "Revised body for shot 1.",
      "<!-- /shot:01 -->",
      "",
      "Interlude.",
      "",
      "<!-- shot:02 -->",
      "Revised body for shot 2.",
      "<!-- /shot:02 -->",
      "",
    ].join("\n");

    const result = await applyScreenplayEdit({
      project,
      sceneSlug: "s01-open",
      markdown: newMd,
      dataDir,
      saveScreenplay,
      createProject,
    });

    expect(result.project.scenes[0]!.screenplay).toBe(newMd);

    const reloaded = await loadProject(dataDir);
    expect(reloaded.scenes[0]!.screenplay).toBe(newMd);
  });

  it("does not touch scene.yaml or shots.yaml", async () => {
    writeScene({ slug: "s01-open", isStarred: true });
    const sceneDir = path.join(dataDir, "scenes", "s01-open");
    const sceneYamlBefore = readFileSync(
      path.join(sceneDir, "scene.yaml"),
      "utf8",
    );
    const shotsYamlBefore = readFileSync(
      path.join(sceneDir, "shots.yaml"),
      "utf8",
    );
    const project = await loadProject(dataDir);

    await applyScreenplayEdit({
      project,
      sceneSlug: "s01-open",
      markdown: "<!-- shot:01 -->\nfresh\n<!-- /shot:01 -->\n",
      dataDir,
      saveScreenplay,
      createProject,
    });

    expect(readFileSync(path.join(sceneDir, "scene.yaml"), "utf8")).toBe(
      sceneYamlBefore,
    );
    expect(readFileSync(path.join(sceneDir, "shots.yaml"), "utf8")).toBe(
      shotsYamlBefore,
    );
  });
});

describe("applyScreenplayEdit — marker validation", () => {
  it("rejects when a shot marker is missing", async () => {
    writeScene({
      slug: "s01-open",
      isStarred: true,
      shotIds: ["01", "02"],
    });
    const project = await loadProject(dataDir);

    await expect(
      applyScreenplayEdit({
        project,
        sceneSlug: "s01-open",
        markdown: "<!-- shot:01 -->\nonly\n<!-- /shot:01 -->\n",
        dataDir,
        saveScreenplay,
        createProject,
      }),
    ).rejects.toThrow(LightEditError);
  });

  it("rejects when an unexpected shot marker is added", async () => {
    writeScene({ slug: "s01-open", isStarred: true, shotIds: ["01"] });
    const project = await loadProject(dataDir);

    const badMd = [
      "<!-- shot:01 -->",
      "A",
      "<!-- /shot:01 -->",
      "<!-- shot:99 -->",
      "new shot",
      "<!-- /shot:99 -->",
    ].join("\n");

    await expect(
      applyScreenplayEdit({
        project,
        sceneSlug: "s01-open",
        markdown: badMd,
        dataDir,
        saveScreenplay,
        createProject,
      }),
    ).rejects.toThrow(LightEditError);
  });

  it("rejects when markers are structurally malformed (unclosed)", async () => {
    writeScene({ slug: "s01-open", isStarred: true, shotIds: ["01"] });
    const project = await loadProject(dataDir);

    await expect(
      applyScreenplayEdit({
        project,
        sceneSlug: "s01-open",
        markdown: "<!-- shot:01 -->\nleak",
        dataDir,
        saveScreenplay,
        createProject,
      }),
    ).rejects.toThrow(LightEditError);
  });

  it("does NOT write the new file when validation fails", async () => {
    writeScene({ slug: "s01-open", isStarred: true, shotIds: ["01"] });
    const sceneDir = path.join(dataDir, "scenes", "s01-open");
    const screenplayBefore = readFileSync(
      path.join(sceneDir, "screenplay.md"),
      "utf8",
    );
    const project = await loadProject(dataDir);

    await expect(
      applyScreenplayEdit({
        project,
        sceneSlug: "s01-open",
        markdown: "no markers at all",
        dataDir,
        saveScreenplay,
        createProject,
      }),
    ).rejects.toThrow();

    // File on disk is unchanged after a failed validation — atomicity guard.
    expect(readFileSync(path.join(sceneDir, "screenplay.md"), "utf8")).toBe(
      screenplayBefore,
    );
  });
});

describe("applyScreenplayEdit — validation", () => {
  it("rejects unknown scene", async () => {
    writeScene({ slug: "s01-open", isStarred: true });
    const project = await loadProject(dataDir);
    await expect(
      applyScreenplayEdit({
        project,
        sceneSlug: "ghost",
        markdown: "<!-- shot:01 -->\nx\n<!-- /shot:01 -->",
        dataDir,
        saveScreenplay,
        createProject,
      }),
    ).rejects.toThrow(LightEditError);
  });
});

// ---------------------------------------------------------------------------
// applySceneCopy
// ---------------------------------------------------------------------------

describe("applySceneCopy — happy path", () => {
  it("clones the scene folder + new scene starts unstarred + project reloaded", async () => {
    writeScene({ slug: "s01-open", isStarred: true });
    const project = await loadProject(dataDir);
    expect(project.scenes).toHaveLength(1);

    const result = await applySceneCopy({
      project,
      sourceSlug: "s01-open",
      newSlug: "s01-open-alt",
      dataDir,
      copyScene,
      loadProject,
    });

    expect(result.project.scenes.map((s) => s.slug).sort()).toEqual([
      "s01-open",
      "s01-open-alt",
    ]);
    const copy = result.project.scenes.find(
      (s) => s.slug === "s01-open-alt",
    )!;
    expect(copy.isStarred).toBe(false);
    expect(copy.shots).toHaveLength(1);
    expect(result.newSlug).toBe("s01-open-alt");
  });
});

describe("applySceneCopy — validation", () => {
  it("rejects when source slug unknown", async () => {
    writeScene({ slug: "s01-open", isStarred: true });
    const project = await loadProject(dataDir);
    await expect(
      applySceneCopy({
        project,
        sourceSlug: "ghost",
        newSlug: "ghost-copy",
        dataDir,
        copyScene,
        loadProject,
      }),
    ).rejects.toThrow(LightEditError);
  });

  it("rejects when newSlug collides", async () => {
    writeScene({ slug: "s01-open", isStarred: true });
    writeScene({ slug: "s02-existing", isStarred: false });
    const project = await loadProject(dataDir);
    await expect(
      applySceneCopy({
        project,
        sourceSlug: "s01-open",
        newSlug: "s02-existing",
        dataDir,
        copyScene,
        loadProject,
      }),
    ).rejects.toThrow(LightEditError);
  });

  it("rejects malformed newSlug (uppercase)", async () => {
    writeScene({ slug: "s01-open", isStarred: true });
    const project = await loadProject(dataDir);
    await expect(
      applySceneCopy({
        project,
        sourceSlug: "s01-open",
        newSlug: "BadCamel",
        dataDir,
        copyScene,
        loadProject,
      }),
    ).rejects.toThrow(LightEditError);
  });
});
