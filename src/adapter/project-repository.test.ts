import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { loadProject, ProjectLoadError } from "./project-repository.js";

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "moviegen-test-"));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

function writeScene(
  slug: string,
  files: { sceneYaml: string; screenplay: string; shotsYaml: string },
): void {
  const sceneDir = path.join(dataDir, "scenes", slug);
  mkdirSync(sceneDir, { recursive: true });
  writeFileSync(path.join(sceneDir, "scene.yaml"), files.sceneYaml);
  writeFileSync(path.join(sceneDir, "screenplay.md"), files.screenplay);
  writeFileSync(path.join(sceneDir, "shots.yaml"), files.shotsYaml);
}

function writeCharacter(name: string, yaml: string): void {
  const dir = path.join(dataDir, "characters");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${name}.yaml`), yaml);
}

function writeLocation(name: string, yaml: string): void {
  const dir = path.join(dataDir, "locations");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${name}.yaml`), yaml);
}

function writeProp(name: string, yaml: string): void {
  const dir = path.join(dataDir, "props");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${name}.yaml`), yaml);
}

const MIN_SHOT_YAML = `
shots:
  - id: "01"
    prompt: "wide street shot"
    duration: 5
    screenplayHash: "abc123"
    characterRefs: []
    locationRefs: []
    propRefs: []
    takes: []
`;

const MIN_SCREENPLAY = `INT. ROOM - DAY

<!-- shot:01 -->
Alice enters.
<!-- /shot:01 -->
`;

const MIN_SCENE_YAML = `
slugline: "INT. ROOM - DAY"
isStarred: true
`;

describe("loadProject — happy path", () => {
  it("loads a minimal project with one starred scene and no characters", async () => {
    writeScene("s01-open", {
      sceneYaml: MIN_SCENE_YAML,
      screenplay: MIN_SCREENPLAY,
      shotsYaml: MIN_SHOT_YAML,
    });

    const project = await loadProject(dataDir);
    expect(project.scenes).toHaveLength(1);
    expect(project.scenes[0]!.slug).toBe("s01-open");
    expect(project.scenes[0]!.slugline).toBe("INT. ROOM - DAY");
    expect(project.scenes[0]!.isStarred).toBe(true);
    expect(project.scenes[0]!.shots).toHaveLength(1);
    expect(project.scenes[0]!.shots[0]!.id).toBe("01");
    expect(project.scenes[0]!.shots[0]!.duration).toBe(5);
  });

  it("loads multiple scenes and applies movie sequence ordering at the project level", async () => {
    writeScene("s02-confrontation", {
      sceneYaml: MIN_SCENE_YAML,
      screenplay: MIN_SCREENPLAY,
      shotsYaml: MIN_SHOT_YAML,
    });
    writeScene("s01-open", {
      sceneYaml: MIN_SCENE_YAML,
      screenplay: MIN_SCREENPLAY,
      shotsYaml: MIN_SHOT_YAML,
    });

    const project = await loadProject(dataDir);
    expect(project.scenes.map((s) => s.slug)).toEqual([
      "s01-open",
      "s02-confrontation",
    ]);
  });

  it("loads characters, locations, props", async () => {
    writeScene("s01-open", {
      sceneYaml: MIN_SCENE_YAML,
      screenplay: MIN_SCREENPLAY,
      shotsYaml: MIN_SHOT_YAML,
    });

    writeCharacter(
      "alice",
      `
name: alice
headshot: alice/headshot.png
looks:
  - name: hoodie
    bodyProfile:
      images:
        - alice/hoodie/body-1.png
        - alice/hoodie/body-2.png
        - alice/hoodie/body-3.png
    faceProfile:
      images:
        - alice/hoodie/face-1.png
        - alice/hoodie/face-2.png
        - alice/hoodie/face-3.png
        - alice/hoodie/face-4.png
        - alice/hoodie/face-5.png
`,
    );

    writeLocation(
      "kitchen",
      `
name: kitchen
references:
  - name: wide
    prompt: "wide shot of kitchen"
    image: kitchen/wide.png
`,
    );

    writeProp(
      "knife",
      `
name: knife
references: []
`,
    );

    const project = await loadProject(dataDir);
    expect(project.characters.map((c) => c.name)).toEqual(["alice"]);
    expect(project.characters[0]!.looks).toHaveLength(1);
    expect(project.characters[0]!.looks[0]!.bodyProfile.images).toHaveLength(3);
    expect(project.characters[0]!.looks[0]!.faceProfile.images).toHaveLength(5);
    expect(project.locations.map((l) => l.name)).toEqual(["kitchen"]);
    expect(project.props.map((p) => p.name)).toEqual(["knife"]);
  });
});

describe("loadProject — error reporting", () => {
  it("throws ProjectLoadError when shots.yaml has invalid duration", async () => {
    writeScene("s01-open", {
      sceneYaml: MIN_SCENE_YAML,
      screenplay: MIN_SCREENPLAY,
      shotsYaml: `
shots:
  - id: "01"
    prompt: "x"
    duration: 99
    screenplayHash: "h"
    characterRefs: []
    locationRefs: []
    propRefs: []
    takes: []
`,
    });

    await expect(loadProject(dataDir)).rejects.toThrow(ProjectLoadError);
    await expect(loadProject(dataDir)).rejects.toThrow(/duration/i);
    await expect(loadProject(dataDir)).rejects.toThrow(/s01-open/);
  });

  it("error message names the failing file", async () => {
    writeScene("s01-open", {
      sceneYaml: `bogus: [unclosed`,
      screenplay: MIN_SCREENPLAY,
      shotsYaml: MIN_SHOT_YAML,
    });

    try {
      await loadProject(dataDir);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ProjectLoadError);
      const message = (err as Error).message;
      expect(message).toContain("scene.yaml");
      expect(message).toContain("s01-open");
    }
  });

  it("rejects scene.yaml missing slugline", async () => {
    writeScene("s01-open", {
      sceneYaml: `isStarred: true`,
      screenplay: MIN_SCREENPLAY,
      shotsYaml: MIN_SHOT_YAML,
    });
    await expect(loadProject(dataDir)).rejects.toThrow(/slugline/i);
  });

  it("rejects BodyProfile with wrong image count", async () => {
    writeScene("s01-open", {
      sceneYaml: MIN_SCENE_YAML,
      screenplay: MIN_SCREENPLAY,
      shotsYaml: MIN_SHOT_YAML,
    });
    writeCharacter(
      "alice",
      `
name: alice
headshot: alice/headshot.png
looks:
  - name: hoodie
    bodyProfile:
      images:
        - alice/hoodie/body-1.png
        - alice/hoodie/body-2.png
    faceProfile:
      images:
        - alice/hoodie/face-1.png
        - alice/hoodie/face-2.png
        - alice/hoodie/face-3.png
        - alice/hoodie/face-4.png
        - alice/hoodie/face-5.png
`,
    );

    await expect(loadProject(dataDir)).rejects.toThrow(/BodyProfile/i);
  });

  it("rejects Shot referencing a Character that does not exist", async () => {
    writeScene("s01-open", {
      sceneYaml: MIN_SCENE_YAML,
      screenplay: MIN_SCREENPLAY,
      shotsYaml: `
shots:
  - id: "01"
    prompt: "x"
    duration: 5
    screenplayHash: "h"
    characterRefs:
      - character: ghost
        look: hoodie
    locationRefs: []
    propRefs: []
    takes: []
`,
    });
    await expect(loadProject(dataDir)).rejects.toThrow(/Character/);
  });

  it("rejects screenplay with unclosed marker", async () => {
    writeScene("s01-open", {
      sceneYaml: MIN_SCENE_YAML,
      screenplay: "<!-- shot:01 -->\nno close",
      shotsYaml: MIN_SHOT_YAML,
    });
    await expect(loadProject(dataDir)).rejects.toThrow(/unclosed/i);
  });

  it("returns empty arrays when optional directories are missing", async () => {
    writeScene("s01-open", {
      sceneYaml: MIN_SCENE_YAML,
      screenplay: MIN_SCREENPLAY,
      shotsYaml: MIN_SHOT_YAML,
    });
    // no characters/, no locations/, no props/
    const project = await loadProject(dataDir);
    expect(project.characters).toEqual([]);
    expect(project.locations).toEqual([]);
    expect(project.props).toEqual([]);
  });

  it("throws when data directory does not exist", async () => {
    await expect(loadProject(path.join(dataDir, "nope"))).rejects.toThrow(
      ProjectLoadError,
    );
  });
});

describe("loadProject — screenplay/shot consistency", () => {
  it("loads even when a Shot has no marker block (orphan signal is for SyncEvaluator)", async () => {
    writeScene("s01-open", {
      sceneYaml: MIN_SCENE_YAML,
      screenplay: "no markers anywhere",
      shotsYaml: MIN_SHOT_YAML,
    });
    // Repository load is structural only; orphan detection lives in SyncEvaluator.
    const project = await loadProject(dataDir);
    expect(project.scenes[0]!.shots).toHaveLength(1);
  });
});
