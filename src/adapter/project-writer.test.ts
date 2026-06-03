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
} from "./project-writer.js";

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
