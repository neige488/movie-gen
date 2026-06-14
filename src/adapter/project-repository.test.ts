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
    faceImage: alice/hoodie/face.png
    bodyImage: alice/hoodie/body.png
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
    expect(project.characters[0]!.looks[0]!.faceImage).toBe(
      "alice/hoodie/face.png",
    );
    expect(project.characters[0]!.looks[0]!.bodyImage).toBe(
      "alice/hoodie/body.png",
    );
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

  it("rejects a look missing bodyImage", async () => {
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
    faceImage: alice/hoodie/face.png
`,
    );

    await expect(loadProject(dataDir)).rejects.toThrow(/bodyImage/i);
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

// ---------------------------------------------------------------------------
// Scene ordering — manifest is the SSOT (ADR 0002), NOT the folder-name prefix.
// loadProject orders project.scenes by data/movie.yaml's linear sequence
// (act1 ++ act2 ++ act3 flatten), reconciling drift on the way.
// ---------------------------------------------------------------------------

function writeManifest(text: string): void {
  writeFileSync(path.join(dataDir, "movie.yaml"), text);
}

describe("loadProject — manifest ordering (ADR 0002)", () => {
  it("orders scenes by the manifest's linear sequence, not by slug", async () => {
    for (const slug of ["s01-a", "s02-b", "s03-c"]) {
      writeScene(slug, {
        sceneYaml: MIN_SCENE_YAML,
        screenplay: MIN_SCREENPLAY,
        shotsYaml: MIN_SHOT_YAML,
      });
    }
    // Deliberately non-alphabetical order across acts.
    writeManifest(`
acts:
  - id: 1
    scenes: [s03-c]
  - id: 2
    scenes: [s01-a]
  - id: 3
    scenes: [s02-b]
`);

    const project = await loadProject(dataDir);
    expect(project.scenes.map((s) => s.slug)).toEqual([
      "s03-c",
      "s01-a",
      "s02-b",
    ]);
  });

  it("falls back to slug order when no manifest exists (migration into act 1)", async () => {
    for (const slug of ["s02-b", "s01-a"]) {
      writeScene(slug, {
        sceneYaml: MIN_SCENE_YAML,
        screenplay: MIN_SCREENPLAY,
        shotsYaml: MIN_SHOT_YAML,
      });
    }
    // No movie.yaml — migration places all scenes in act 1 in folder-slug order.
    const project = await loadProject(dataDir);
    expect(project.scenes.map((s) => s.slug)).toEqual(["s01-a", "s02-b"]);
  });

  it("appends an orphan folder (missing from manifest) to the end of the sequence", async () => {
    for (const slug of ["s01-a", "s02-b", "s03-new"]) {
      writeScene(slug, {
        sceneYaml: MIN_SCENE_YAML,
        screenplay: MIN_SCREENPLAY,
        shotsYaml: MIN_SHOT_YAML,
      });
    }
    writeManifest(`
acts:
  - id: 1
    scenes: [s02-b]
  - id: 2
    scenes: [s01-a]
  - id: 3
    scenes: []
`);

    const project = await loadProject(dataDir);
    // s03-new is reconciled to the end of act 1 → appears after s02-b but
    // before act 2's s01-a in the flattened linear order.
    expect(project.scenes.map((s) => s.slug)).toEqual([
      "s02-b",
      "s03-new",
      "s01-a",
    ]);
  });
});
