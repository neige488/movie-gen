/**
 * ProjectWriter — integration tests against real temp `data/` directory.
 *
 * Tests the round-trip: load → mutate → save → reload. This is the key
 * guarantee: web layer can call `saveCharacter` and trust the next
 * `loadProject` will return the mutated state.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { loadProject } from "./project-repository.js";
import {
  saveCharacter,
  saveLocation,
  saveProp,
  saveSceneShots,
} from "./project-writer.js";
import { createTake } from "@domain/movie.js";

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "moviegen-writer-"));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

function writeMinimalScene(): void {
  const sceneDir = path.join(dataDir, "scenes", "s01-open");
  mkdirSync(sceneDir, { recursive: true });
  writeFileSync(
    path.join(sceneDir, "scene.yaml"),
    `slugline: "INT. ROOM - DAY"\nisStarred: true\n`,
  );
  writeFileSync(
    path.join(sceneDir, "screenplay.md"),
    `INT. ROOM\n\n<!-- shot:01 -->\nHi.\n<!-- /shot:01 -->\n`,
  );
  writeFileSync(
    path.join(sceneDir, "shots.yaml"),
    `shots:\n  - id: "01"\n    prompt: "x"\n    duration: 5\n    screenplayHash: "h"\n    characterRefs: []\n    locationRefs: []\n    propRefs: []\n    takes: []\n`,
  );
}

function writeCharacterFile(name: string, yaml: string): void {
  const dir = path.join(dataDir, "characters");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${name}.yaml`), yaml);
}

function writeLocationFile(name: string, yaml: string): void {
  const dir = path.join(dataDir, "locations");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${name}.yaml`), yaml);
}

function writePropFile(name: string, yaml: string): void {
  const dir = path.join(dataDir, "props");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${name}.yaml`), yaml);
}

const ALICE_YAML = `
name: alice
headshot: alice/headshot.png
looks:
  - name: hoodie
    bodyProfile:
      images:
        - alice/hoodie/body-0.png
        - alice/hoodie/body-1.png
        - alice/hoodie/body-2.png
    faceProfile:
      images:
        - alice/hoodie/face-0.png
        - alice/hoodie/face-1.png
        - alice/hoodie/face-2.png
        - alice/hoodie/face-3.png
        - alice/hoodie/face-4.png
`;

describe("saveCharacter — round-trip", () => {
  it("updates headshot path and reloads", async () => {
    writeMinimalScene();
    writeCharacterFile("alice", ALICE_YAML);

    const before = await loadProject(dataDir);
    const alice = before.characters[0]!;
    expect(alice.headshot).toBe("alice/headshot.png");

    await saveCharacter(dataDir, {
      ...alice,
      headshot: "alice/headshot-2.png",
    });

    const after = await loadProject(dataDir);
    expect(after.characters[0]!.headshot).toBe("alice/headshot-2.png");
  });

  it("updates a face profile image at a specific index", async () => {
    writeMinimalScene();
    writeCharacterFile("alice", ALICE_YAML);

    const before = await loadProject(dataDir);
    const alice = before.characters[0]!;
    const hoodie = alice.looks[0]!;

    const newFaceImages = [...hoodie.faceProfile.images];
    newFaceImages[2] = "alice/hoodie/face-2-v2.png";

    await saveCharacter(dataDir, {
      ...alice,
      looks: [
        {
          ...hoodie,
          faceProfile: { images: newFaceImages },
        },
        ...alice.looks.slice(1),
      ],
    });

    const after = await loadProject(dataDir);
    expect(after.characters[0]!.looks[0]!.faceProfile.images[2]).toBe(
      "alice/hoodie/face-2-v2.png",
    );
    // Other face images preserved.
    expect(after.characters[0]!.looks[0]!.faceProfile.images[0]).toBe(
      "alice/hoodie/face-0.png",
    );
  });

  it("updates a body profile image at a specific index", async () => {
    writeMinimalScene();
    writeCharacterFile("alice", ALICE_YAML);

    const before = await loadProject(dataDir);
    const alice = before.characters[0]!;
    const hoodie = alice.looks[0]!;
    const newBodyImages = [...hoodie.bodyProfile.images];
    newBodyImages[1] = "alice/hoodie/body-1-fresh.png";

    await saveCharacter(dataDir, {
      ...alice,
      looks: [
        {
          ...hoodie,
          bodyProfile: { images: newBodyImages },
        },
      ],
    });

    const after = await loadProject(dataDir);
    expect(after.characters[0]!.looks[0]!.bodyProfile.images[1]).toBe(
      "alice/hoodie/body-1-fresh.png",
    );
  });
});

describe("saveLocation — round-trip", () => {
  it("appends a new reference", async () => {
    writeMinimalScene();
    writeLocationFile(
      "kitchen",
      `
name: kitchen
references:
  - name: wide
    prompt: "wide shot"
    image: kitchen/wide.png
`,
    );

    const before = await loadProject(dataDir);
    const kitchen = before.locations[0]!;
    await saveLocation(dataDir, {
      ...kitchen,
      references: [
        ...kitchen.references,
        {
          name: "close",
          prompt: "close shot",
          image: "kitchen/close.png",
        },
      ],
    });

    const after = await loadProject(dataDir);
    expect(after.locations[0]!.references).toHaveLength(2);
    expect(after.locations[0]!.references[1]!.name).toBe("close");
    expect(after.locations[0]!.references[1]!.image).toBe("kitchen/close.png");
  });

  it("updates an existing reference's image path", async () => {
    writeMinimalScene();
    writeLocationFile(
      "kitchen",
      `
name: kitchen
references:
  - name: wide
    prompt: "wide shot"
    image: kitchen/wide.png
`,
    );

    const before = await loadProject(dataDir);
    const kitchen = before.locations[0]!;
    await saveLocation(dataDir, {
      ...kitchen,
      references: kitchen.references.map((r) =>
        r.name === "wide" ? { ...r, image: "kitchen/wide-v2.png" } : r,
      ),
    });

    const after = await loadProject(dataDir);
    expect(after.locations[0]!.references[0]!.image).toBe(
      "kitchen/wide-v2.png",
    );
    // Prompt preserved.
    expect(after.locations[0]!.references[0]!.prompt).toBe("wide shot");
  });
});

describe("saveSceneShots — round-trip", () => {
  it("appends a new Take to a Shot and reloads", async () => {
    writeMinimalScene();

    const before = await loadProject(dataDir);
    const scene = before.scenes[0]!;
    const shot = scene.shots[0]!;
    expect(shot.takes).toHaveLength(0);

    const newTake = createTake({
      id: "take-001",
      videoPath: "videos/scenes/s01-open/shots/01/takes/take-001.mp4",
      screenplayHash: shot.screenplayHash,
      createdAt: "2026-06-03T10:00:00.000Z",
    });
    await saveSceneShots(dataDir, scene.slug, [
      { ...shot, takes: [...shot.takes, newTake] },
    ]);

    const after = await loadProject(dataDir);
    const reloadedShot = after.scenes[0]!.shots[0]!;
    expect(reloadedShot.takes).toHaveLength(1);
    expect(reloadedShot.takes[0]!.id).toBe("take-001");
    expect(reloadedShot.takes[0]!.videoPath).toBe(
      "videos/scenes/s01-open/shots/01/takes/take-001.mp4",
    );
    expect(reloadedShot.takes[0]!.createdAt).toBe(
      "2026-06-03T10:00:00.000Z",
    );
    expect(reloadedShot.takes[0]!.isStarred).toBe(false);
  });

  it("preserves Shot prompt / duration / refs / hash on round-trip", async () => {
    // Write a scene with full Shot metadata and round-trip it through a takes
    // append. The non-take fields must survive the rewrite untouched.
    const sceneDir = path.join(dataDir, "scenes", "s02-rich");
    mkdirSync(sceneDir, { recursive: true });
    writeFileSync(
      path.join(sceneDir, "scene.yaml"),
      `slugline: "EXT. STREET - NIGHT"\nisStarred: true\n`,
    );
    writeFileSync(
      path.join(sceneDir, "screenplay.md"),
      `<!-- shot:01 -->\nBody.\n<!-- /shot:01 -->\n`,
    );
    writeFileSync(
      path.join(sceneDir, "shots.yaml"),
      [
        `shots:`,
        `  - id: "01"`,
        `    prompt: "Wide shot, rain at night"`,
        `    duration: 8`,
        `    screenplayHash: "abc"`,
        `    characterRefs: []`,
        `    locationRefs:`,
        `      - location: street`,
        `        reference: corner`,
        `    propRefs: []`,
        `    takes: []`,
        ``,
      ].join("\n"),
    );
    writeLocationFile(
      "street",
      `name: street\nreferences:\n  - name: corner\n    prompt: "x"\n    image: street/corner.png\n`,
    );

    const before = await loadProject(dataDir);
    const scene = before.scenes[0]!;
    const shot = scene.shots[0]!;

    const newTake = createTake({
      id: "take-001",
      videoPath: "videos/scenes/s02-rich/shots/01/takes/take-001.mp4",
      screenplayHash: shot.screenplayHash,
      createdAt: "2026-06-03T11:00:00.000Z",
    });
    await saveSceneShots(dataDir, scene.slug, [
      { ...shot, takes: [...shot.takes, newTake] },
    ]);

    const after = await loadProject(dataDir);
    const reloadedShot = after.scenes[0]!.shots[0]!;
    expect(reloadedShot.prompt).toBe("Wide shot, rain at night");
    expect(reloadedShot.duration).toBe(8);
    expect(reloadedShot.screenplayHash).toBe("abc");
    expect(reloadedShot.locationRefs).toHaveLength(1);
    expect(reloadedShot.locationRefs[0]!.location).toBe("street");
    expect(reloadedShot.locationRefs[0]!.reference).toBe("corner");
    expect(reloadedShot.takes).toHaveLength(1);
  });

  it("preserves prevShotRef on round-trip when set", async () => {
    const sceneDir = path.join(dataDir, "scenes", "s03-chain");
    mkdirSync(sceneDir, { recursive: true });
    writeFileSync(
      path.join(sceneDir, "scene.yaml"),
      `slugline: "INT. ROOM - DAY"\nisStarred: true\n`,
    );
    writeFileSync(
      path.join(sceneDir, "screenplay.md"),
      `<!-- shot:01 -->\nA.\n<!-- /shot:01 -->\n<!-- shot:02 -->\nB.\n<!-- /shot:02 -->\n`,
    );
    writeFileSync(
      path.join(sceneDir, "shots.yaml"),
      [
        `shots:`,
        `  - id: "01"`,
        `    prompt: "first"`,
        `    duration: 5`,
        `    screenplayHash: "h1"`,
        `    characterRefs: []`,
        `    locationRefs: []`,
        `    propRefs: []`,
        `    takes: []`,
        `  - id: "02"`,
        `    prompt: "second"`,
        `    duration: 5`,
        `    screenplayHash: "h2"`,
        `    prevShotRef: "01"`,
        `    characterRefs: []`,
        `    locationRefs: []`,
        `    propRefs: []`,
        `    takes: []`,
        ``,
      ].join("\n"),
    );

    const before = await loadProject(dataDir);
    const scene = before.scenes[0]!;
    await saveSceneShots(dataDir, scene.slug, scene.shots);

    const after = await loadProject(dataDir);
    expect(after.scenes[0]!.shots[1]!.prevShotRef).toBe("01");
  });
});

describe("saveProp — round-trip", () => {
  it("appends a reference", async () => {
    writeMinimalScene();
    writePropFile(
      "knife",
      `
name: knife
references: []
`,
    );
    const before = await loadProject(dataDir);
    const knife = before.props[0]!;
    await saveProp(dataDir, {
      ...knife,
      references: [
        {
          name: "blade",
          prompt: "kitchen knife blade close",
          image: "knife/blade.png",
        },
      ],
    });

    const after = await loadProject(dataDir);
    expect(after.props[0]!.references).toHaveLength(1);
    expect(after.props[0]!.references[0]!.name).toBe("blade");
  });
});
