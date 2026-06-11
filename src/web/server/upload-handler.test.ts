/**
 * Upload handler — orchestrates AssetStore.upload + YAML mutation.
 *
 * Integration test against real temp data/ + assets/. The handler is the
 * domain-aware piece: given an AssetSlot, it knows which yaml field to patch
 * and which save* function to call.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  existsSync,
} from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { loadProject } from "@adapter/project-repository.js";
import {
  saveCharacter,
  saveLocation,
  saveProp,
} from "@adapter/project-writer.js";
import { createAssetStore } from "@adapter/asset-store.js";
import { createProject } from "@domain/movie.js";
import { applyUpload } from "./upload-handler.js";

let dataDir: string;
let assetsDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "moviegen-upload-data-"));
  assetsDir = mkdtempSync(path.join(tmpdir(), "moviegen-upload-assets-"));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(assetsDir, { recursive: true, force: true });
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

async function setupHandler() {
  writeMinimalScene();
  const project = await loadProject(dataDir);
  const assetStore = createAssetStore(assetsDir);
  return { project, assetStore };
}

describe("applyUpload — character headshot", () => {
  it("writes file, updates character.headshot, reloads with new path", async () => {
    writeCharacter("alice", ALICE_YAML);
    const ctx = await setupHandler();

    const result = await applyUpload({
      project: ctx.project,
      command: {
        slot: { kind: "character-headshot", character: "alice" },
        originalFilename: "h.png",
        data: Buffer.from("HEAD"),
      },
      assetStore: ctx.assetStore,
      dataDir,
      saveCharacter,
      saveLocation,
      saveProp,
      createProject,
    });

    expect(result.relativePath).toBe("characters/alice/headshot.png");
    expect(existsSync(path.join(assetsDir, result.relativePath))).toBe(true);
    expect(readFileSync(path.join(assetsDir, result.relativePath), "utf8")).toBe(
      "HEAD",
    );

    // YAML on disk updated.
    const reloaded = await loadProject(dataDir);
    expect(reloaded.characters[0]!.headshot).toBe(
      "characters/alice/headshot.png",
    );
    // In-memory project also updated.
    expect(result.project.characters[0]!.headshot).toBe(
      "characters/alice/headshot.png",
    );
  });

  it("handles second upload with collision suffix", async () => {
    writeCharacter("alice", ALICE_YAML);
    let ctx = await setupHandler();

    // First upload to seed the file.
    const r1 = await applyUpload({
      project: ctx.project,
      command: {
        slot: { kind: "character-headshot", character: "alice" },
        originalFilename: "h.png",
        data: Buffer.from("v1"),
      },
      assetStore: ctx.assetStore,
      dataDir,
      saveCharacter,
      saveLocation,
      saveProp,
      createProject,
    });
    ctx = { ...ctx, project: r1.project };

    const r2 = await applyUpload({
      project: ctx.project,
      command: {
        slot: { kind: "character-headshot", character: "alice" },
        originalFilename: "h.png",
        data: Buffer.from("v2"),
      },
      assetStore: ctx.assetStore,
      dataDir,
      saveCharacter,
      saveLocation,
      saveProp,
      createProject,
    });

    expect(r1.relativePath).toBe("characters/alice/headshot.png");
    expect(r2.relativePath).toBe("characters/alice/headshot-2.png");
    // The latest upload becomes the active headshot.
    const reloaded = await loadProject(dataDir);
    expect(reloaded.characters[0]!.headshot).toBe(
      "characters/alice/headshot-2.png",
    );
  });
});

describe("applyUpload — character face/body slots", () => {
  it("updates the face image at the given index, leaving others untouched", async () => {
    writeCharacter("alice", ALICE_YAML);
    const ctx = await setupHandler();

    const result = await applyUpload({
      project: ctx.project,
      command: {
        slot: {
          kind: "character-face",
          character: "alice",
          look: "hoodie",
          index: 2,
        },
        originalFilename: "f.png",
        data: Buffer.from("F2"),
      },
      assetStore: ctx.assetStore,
      dataDir,
      saveCharacter,
      saveLocation,
      saveProp,
      createProject,
    });

    expect(result.relativePath).toBe("characters/alice/hoodie/face-2.png");
    const reloaded = await loadProject(dataDir);
    const faces = reloaded.characters[0]!.looks[0]!.faceProfile.images;
    expect(faces[2]).toBe("characters/alice/hoodie/face-2.png");
    expect(faces[0]).toBe("alice/hoodie/face-0.png"); // unchanged
    expect(faces[4]).toBe("alice/hoodie/face-4.png"); // unchanged
  });

  it("updates body image at the given index", async () => {
    writeCharacter("alice", ALICE_YAML);
    const ctx = await setupHandler();

    await applyUpload({
      project: ctx.project,
      command: {
        slot: {
          kind: "character-body",
          character: "alice",
          look: "hoodie",
          index: 1,
        },
        originalFilename: "b.png",
        data: Buffer.from("B1"),
      },
      assetStore: ctx.assetStore,
      dataDir,
      saveCharacter,
      saveLocation,
      saveProp,
      createProject,
    });

    const reloaded = await loadProject(dataDir);
    const bodies = reloaded.characters[0]!.looks[0]!.bodyProfile.images;
    expect(bodies[1]).toBe("characters/alice/hoodie/body-1.png");
    expect(bodies[0]).toBe("alice/hoodie/body-0.png"); // unchanged
  });

  it("rejects upload targeting unknown character", async () => {
    writeCharacter("alice", ALICE_YAML);
    const ctx = await setupHandler();
    await expect(
      applyUpload({
        project: ctx.project,
        command: {
          slot: { kind: "character-headshot", character: "ghost" },
          originalFilename: "x.png",
          data: Buffer.from("X"),
        },
        assetStore: ctx.assetStore,
        dataDir,
        saveCharacter,
        saveLocation,
        saveProp,
        createProject,
      }),
    ).rejects.toThrow(/character.*ghost/i);
  });

  it("rejects upload targeting unknown look", async () => {
    writeCharacter("alice", ALICE_YAML);
    const ctx = await setupHandler();
    await expect(
      applyUpload({
        project: ctx.project,
        command: {
          slot: {
            kind: "character-face",
            character: "alice",
            look: "ghost-look",
            index: 0,
          },
          originalFilename: "x.png",
          data: Buffer.from("X"),
        },
        assetStore: ctx.assetStore,
        dataDir,
        saveCharacter,
        saveLocation,
        saveProp,
        createProject,
      }),
    ).rejects.toThrow(/look.*ghost-look/i);
  });
});

describe("applyUpload — location / prop refs", () => {
  it("updates existing location reference image path", async () => {
    writeLocation(
      "kitchen",
      `
name: kitchen
references:
  - name: wide
    prompt: "wide shot"
    image: kitchen/wide.png
`,
    );
    const ctx = await setupHandler();

    const result = await applyUpload({
      project: ctx.project,
      command: {
        slot: {
          kind: "location-ref",
          location: "kitchen",
          refName: "wide",
        },
        originalFilename: "k.png",
        data: Buffer.from("K"),
      },
      assetStore: ctx.assetStore,
      dataDir,
      saveCharacter,
      saveLocation,
      saveProp,
      createProject,
    });

    expect(result.relativePath).toBe("locations/kitchen/wide.png");
    const reloaded = await loadProject(dataDir);
    expect(reloaded.locations[0]!.references[0]!.image).toBe(
      "locations/kitchen/wide.png",
    );
    // Prompt preserved.
    expect(reloaded.locations[0]!.references[0]!.prompt).toBe("wide shot");
  });

  it("updates existing prop reference image path", async () => {
    writeProp(
      "knife",
      `
name: knife
references:
  - name: blade
    prompt: "blade close"
    image: knife/blade.png
`,
    );
    const ctx = await setupHandler();

    const result = await applyUpload({
      project: ctx.project,
      command: {
        slot: { kind: "prop-ref", prop: "knife", refName: "blade" },
        originalFilename: "k.png",
        data: Buffer.from("K"),
      },
      assetStore: ctx.assetStore,
      dataDir,
      saveCharacter,
      saveLocation,
      saveProp,
      createProject,
    });

    expect(result.relativePath).toBe("props/knife/blade.png");
    const reloaded = await loadProject(dataDir);
    expect(reloaded.props[0]!.references[0]!.image).toBe(
      "props/knife/blade.png",
    );
  });

  it("rejects upload targeting unknown location reference", async () => {
    writeLocation(
      "kitchen",
      `name: kitchen\nreferences:\n  - name: wide\n    prompt: "x"\n    image: kitchen/wide.png\n`,
    );
    const ctx = await setupHandler();
    await expect(
      applyUpload({
        project: ctx.project,
        command: {
          slot: { kind: "location-ref", location: "kitchen", refName: "ghost" },
          originalFilename: "x.png",
          data: Buffer.from("X"),
        },
        assetStore: ctx.assetStore,
        dataDir,
        saveCharacter,
        saveLocation,
        saveProp,
        createProject,
      }),
    ).rejects.toThrow(/reference.*ghost/i);
  });
});
