/**
 * ScreenplayWriter — integration tests against a real temp `data/`.
 *
 * Slice 5 (Light edit). Tests cover the round-trip:
 *  - saveScreenplay writes `data/scenes/<slug>/screenplay.md`
 *  - The other Scene files (scene.yaml, shots.yaml) are untouched
 *  - A subsequent loadProject sees the new text
 *  - Path traversal in sceneSlug is refused (path-safety defense in depth)
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
import {
  saveScreenplay,
  ScreenplayWriterError,
} from "./screenplay-writer.js";

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "moviegen-screenplay-"));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

function writeScene(slug: string): void {
  const sceneDir = path.join(dataDir, "scenes", slug);
  mkdirSync(sceneDir, { recursive: true });
  writeFileSync(
    path.join(sceneDir, "scene.yaml"),
    `slugline: "INT. ROOM - DAY"\nisStarred: true\n`,
  );
  writeFileSync(
    path.join(sceneDir, "screenplay.md"),
    `# Original\n\n<!-- shot:01 -->\nOriginal body.\n<!-- /shot:01 -->\n`,
  );
  writeFileSync(
    path.join(sceneDir, "shots.yaml"),
    `shots:\n  - id: "01"\n    prompt: "x"\n    duration: 5\n    screenplayHash: "h"\n    characterRefs: []\n    locationRefs: []\n    propRefs: []\n    takes: []\n`,
  );
}

describe("saveScreenplay — round-trip", () => {
  it("writes a new screenplay.md and reload returns the new text", async () => {
    writeScene("s01-open");
    const newMd =
      "# Updated\n\n<!-- shot:01 -->\nNew body text.\n<!-- /shot:01 -->\n";
    await saveScreenplay(dataDir, "s01-open", newMd);

    const onDisk = readFileSync(
      path.join(dataDir, "scenes", "s01-open", "screenplay.md"),
      "utf8",
    );
    expect(onDisk).toBe(newMd);

    const project = await loadProject(dataDir);
    expect(project.scenes[0]!.screenplay).toBe(newMd);
  });

  it("does not modify scene.yaml or shots.yaml", async () => {
    writeScene("s01-open");
    const sceneYamlBefore = readFileSync(
      path.join(dataDir, "scenes", "s01-open", "scene.yaml"),
      "utf8",
    );
    const shotsYamlBefore = readFileSync(
      path.join(dataDir, "scenes", "s01-open", "shots.yaml"),
      "utf8",
    );

    await saveScreenplay(
      dataDir,
      "s01-open",
      "<!-- shot:01 -->\nFresh.\n<!-- /shot:01 -->\n",
    );

    expect(
      readFileSync(
        path.join(dataDir, "scenes", "s01-open", "scene.yaml"),
        "utf8",
      ),
    ).toBe(sceneYamlBefore);
    expect(
      readFileSync(
        path.join(dataDir, "scenes", "s01-open", "shots.yaml"),
        "utf8",
      ),
    ).toBe(shotsYamlBefore);
  });
});

describe("saveScreenplay — path safety", () => {
  it("rejects scene slugs with path traversal segments", async () => {
    writeScene("s01-open");
    await expect(
      saveScreenplay(dataDir, "../escape", "anything"),
    ).rejects.toThrow(ScreenplayWriterError);
    // The traversal target must not be created either.
    expect(existsSync(path.join(dataDir, "..", "escape"))).toBe(false);
  });

  it("rejects empty slug", async () => {
    await expect(saveScreenplay(dataDir, "", "x")).rejects.toThrow(
      ScreenplayWriterError,
    );
  });

  it("rejects slug containing path separators", async () => {
    await expect(saveScreenplay(dataDir, "a/b", "x")).rejects.toThrow(
      ScreenplayWriterError,
    );
  });
});
