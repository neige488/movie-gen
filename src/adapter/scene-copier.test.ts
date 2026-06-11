/**
 * SceneCopier — integration tests against real temp `data/`.
 *
 * Slice 5 (Light edit). Tests cover the round-trip:
 *  - copyScene clones the Scene folder (scene.yaml + screenplay.md + shots.yaml)
 *  - The new Scene's `isStarred` is forced to false (branch default)
 *  - newSlug collision is refused
 *  - Source slug must exist
 *  - newSlug must be kebab-case-safe (no traversal, no path separators)
 *  - loadProject sees both Scenes after the copy
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { loadProject } from "./project-repository.js";
import { copyScene, SceneCopierError } from "./scene-copier.js";

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "moviegen-copier-"));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

const SAMPLE_SCREENPLAY =
  "# INT. ROOM - DAY\n\n<!-- shot:01 -->\nBody.\n<!-- /shot:01 -->\n";
const SAMPLE_SHOTS = [
  `shots:`,
  `  - id: "01"`,
  `    prompt: "x"`,
  `    duration: 5`,
  `    screenplayHash: "h"`,
  `    characterRefs: []`,
  `    locationRefs: []`,
  `    propRefs: []`,
  `    takes: []`,
  ``,
].join("\n");

function writeScene(opts: { slug: string; isStarred: boolean }): void {
  const sceneDir = path.join(dataDir, "scenes", opts.slug);
  mkdirSync(sceneDir, { recursive: true });
  writeFileSync(
    path.join(sceneDir, "scene.yaml"),
    `slugline: "INT. ${opts.slug.toUpperCase()} - DAY"\nisStarred: ${opts.isStarred}\n`,
  );
  writeFileSync(path.join(sceneDir, "screenplay.md"), SAMPLE_SCREENPLAY);
  writeFileSync(path.join(sceneDir, "shots.yaml"), SAMPLE_SHOTS);
}

describe("copyScene — happy path", () => {
  it("clones the Scene folder under the new slug", async () => {
    writeScene({ slug: "s01-open", isStarred: true });
    await copyScene(dataDir, "s01-open", "s01-open-alt");

    const newDir = path.join(dataDir, "scenes", "s01-open-alt");
    expect(existsSync(path.join(newDir, "scene.yaml"))).toBe(true);
    expect(existsSync(path.join(newDir, "screenplay.md"))).toBe(true);
    expect(existsSync(path.join(newDir, "shots.yaml"))).toBe(true);

    expect(readFileSync(path.join(newDir, "screenplay.md"), "utf8")).toBe(
      SAMPLE_SCREENPLAY,
    );
    expect(readFileSync(path.join(newDir, "shots.yaml"), "utf8")).toBe(
      SAMPLE_SHOTS,
    );
  });

  it("forces the new Scene's isStarred to false even if source is starred", async () => {
    writeScene({ slug: "s01-open", isStarred: true });
    await copyScene(dataDir, "s01-open", "s01-open-alt");

    const newSceneYaml = readFileSync(
      path.join(dataDir, "scenes", "s01-open-alt", "scene.yaml"),
      "utf8",
    );
    expect(newSceneYaml).toMatch(/isStarred:\s*false/);

    // Source scene's isStarred must remain true.
    const origYaml = readFileSync(
      path.join(dataDir, "scenes", "s01-open", "scene.yaml"),
      "utf8",
    );
    expect(origYaml).toMatch(/isStarred:\s*true/);
  });

  it("preserves the source slugline on the new Scene", async () => {
    writeScene({ slug: "s01-open", isStarred: true });
    await copyScene(dataDir, "s01-open", "s01-open-alt");

    const newSceneYaml = readFileSync(
      path.join(dataDir, "scenes", "s01-open-alt", "scene.yaml"),
      "utf8",
    );
    // Slugline text copied verbatim.
    expect(newSceneYaml).toMatch(/INT\. S01-OPEN - DAY/);
  });

  it("loadProject after copy sees both scenes", async () => {
    writeScene({ slug: "s01-open", isStarred: true });
    await copyScene(dataDir, "s01-open", "s01-open-alt");

    const project = await loadProject(dataDir);
    const slugs = project.scenes.map((s) => s.slug).sort();
    expect(slugs).toEqual(["s01-open", "s01-open-alt"]);
    const copy = project.scenes.find((s) => s.slug === "s01-open-alt")!;
    expect(copy.isStarred).toBe(false);
    // Source scene Shot ids are preserved in the copy.
    expect(copy.shots.map((s) => s.id)).toEqual(["01"]);
  });
});

describe("copyScene — validation", () => {
  it("rejects when source slug does not exist", async () => {
    writeScene({ slug: "s01-open", isStarred: false });
    await expect(
      copyScene(dataDir, "ghost", "any-new"),
    ).rejects.toThrow(SceneCopierError);
  });

  it("rejects when newSlug already exists on disk", async () => {
    writeScene({ slug: "s01-open", isStarred: true });
    writeScene({ slug: "s02-existing", isStarred: false });
    await expect(
      copyScene(dataDir, "s01-open", "s02-existing"),
    ).rejects.toThrow(SceneCopierError);
    await expect(
      copyScene(dataDir, "s01-open", "s02-existing"),
    ).rejects.toThrow(/already exists/i);
  });

  it("rejects when newSlug is empty", async () => {
    writeScene({ slug: "s01-open", isStarred: false });
    await expect(copyScene(dataDir, "s01-open", "")).rejects.toThrow(
      SceneCopierError,
    );
  });

  it("rejects when newSlug uses uppercase / not kebab-case", async () => {
    writeScene({ slug: "s01-open", isStarred: false });
    await expect(
      copyScene(dataDir, "s01-open", "BadCamel"),
    ).rejects.toThrow(SceneCopierError);
  });

  it("rejects when newSlug contains path separators", async () => {
    writeScene({ slug: "s01-open", isStarred: false });
    await expect(
      copyScene(dataDir, "s01-open", "with/slash"),
    ).rejects.toThrow(SceneCopierError);
  });

  it("rejects when newSlug attempts traversal", async () => {
    writeScene({ slug: "s01-open", isStarred: false });
    await expect(
      copyScene(dataDir, "s01-open", "../escape"),
    ).rejects.toThrow(SceneCopierError);
  });

  it("rejects when newSlug equals sourceSlug", async () => {
    writeScene({ slug: "s01-open", isStarred: false });
    await expect(
      copyScene(dataDir, "s01-open", "s01-open"),
    ).rejects.toThrow(SceneCopierError);
  });
});
