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
  saveSceneShots,
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
headshot:
  image: alice/headshot.png
looks:
  - name: hoodie
    face:
      image: alice/hoodie/face.png
    body:
      image: alice/hoodie/body.png
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
      saveSceneShots,
      createProject,
    });

    expect(result.relativePath).toBe("characters/alice/headshot.png");
    expect(existsSync(path.join(assetsDir, result.relativePath))).toBe(true);
    expect(readFileSync(path.join(assetsDir, result.relativePath), "utf8")).toBe(
      "HEAD",
    );

    // YAML on disk updated.
    const reloaded = await loadProject(dataDir);
    expect(reloaded.characters[0]!.headshot.image).toBe(
      "characters/alice/headshot.png",
    );
    // In-memory project also updated.
    expect(result.project.characters[0]!.headshot.image).toBe(
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
      saveSceneShots,
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
      saveSceneShots,
      createProject,
    });

    expect(r1.relativePath).toBe("characters/alice/headshot.png");
    expect(r2.relativePath).toBe("characters/alice/headshot-2.png");
    // The latest upload becomes the active headshot.
    const reloaded = await loadProject(dataDir);
    expect(reloaded.characters[0]!.headshot.image).toBe(
      "characters/alice/headshot-2.png",
    );
  });
});

describe("applyUpload — character face/body slots", () => {
  it("updates the look's face image, leaving body untouched", async () => {
    writeCharacter("alice", ALICE_YAML);
    const ctx = await setupHandler();

    const result = await applyUpload({
      project: ctx.project,
      command: {
        slot: {
          kind: "character-face",
          character: "alice",
          look: "hoodie",
        },
        originalFilename: "f.png",
        data: Buffer.from("FACE"),
      },
      assetStore: ctx.assetStore,
      dataDir,
      saveCharacter,
      saveLocation,
      saveProp,
      saveSceneShots,
      createProject,
    });

    expect(result.relativePath).toBe("characters/alice/hoodie/face.png");
    const reloaded = await loadProject(dataDir);
    const look = reloaded.characters[0]!.looks[0]!;
    expect(look.face.image).toBe("characters/alice/hoodie/face.png");
    expect(look.body.image).toBe("alice/hoodie/body.png"); // unchanged
  });

  it("updates the look's body image", async () => {
    writeCharacter("alice", ALICE_YAML);
    const ctx = await setupHandler();

    await applyUpload({
      project: ctx.project,
      command: {
        slot: {
          kind: "character-body",
          character: "alice",
          look: "hoodie",
        },
        originalFilename: "b.png",
        data: Buffer.from("BODY"),
      },
      assetStore: ctx.assetStore,
      dataDir,
      saveCharacter,
      saveLocation,
      saveProp,
      saveSceneShots,
      createProject,
    });

    const reloaded = await loadProject(dataDir);
    const look = reloaded.characters[0]!.looks[0]!;
    expect(look.body.image).toBe("characters/alice/hoodie/body.png");
    expect(look.face.image).toBe("alice/hoodie/face.png"); // unchanged
  });

  it("creates the look's uniform on upload when the look had none", async () => {
    // ALICE_YAML's hoodie look has no uniform — uploading one creates it.
    writeCharacter("alice", ALICE_YAML);
    const ctx = await setupHandler();

    await applyUpload({
      project: ctx.project,
      command: {
        slot: { kind: "character-uniform", character: "alice", look: "hoodie" },
        originalFilename: "u.png",
        data: Buffer.from("UNIFORM"),
      },
      assetStore: ctx.assetStore,
      dataDir,
      saveCharacter,
      saveLocation,
      saveProp,
      saveSceneShots,
      createProject,
    });

    const reloaded = await loadProject(dataDir);
    const look = reloaded.characters[0]!.looks[0]!;
    expect(look.uniform?.image).toBe("characters/alice/hoodie/uniform.png");
    // face/body untouched.
    expect(look.face.image).toBe("alice/hoodie/face.png");
    expect(look.body.image).toBe("alice/hoodie/body.png");
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
        saveSceneShots,
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
          },
          originalFilename: "x.png",
          data: Buffer.from("X"),
        },
        assetStore: ctx.assetStore,
        dataDir,
        saveCharacter,
        saveLocation,
        saveProp,
        saveSceneShots,
        createProject,
      }),
    ).rejects.toThrow(/look.*ghost-look/i);
  });
});

describe("applyUpload — character voice (video)", () => {
  const ALICE_WITH_VOICE_PROMPT = `
name: alice
headshot:
  image: alice/headshot.png
voice:
  prompt: "자기소개 + 대사 믹스"
  refName: p1_c_alice_voice
  video: ""
looks:
  - name: hoodie
    face:
      image: alice/hoodie/face.png
    body:
      image: alice/hoodie/body.png
`;

  it("creates the voice video on upload when the character had none", async () => {
    writeCharacter("alice", ALICE_YAML);
    const ctx = await setupHandler();

    const result = await applyUpload({
      project: ctx.project,
      command: {
        slot: { kind: "character-voice", character: "alice" },
        originalFilename: "intro.mp4",
        data: Buffer.from("VOICE"),
      },
      assetStore: ctx.assetStore,
      dataDir,
      saveCharacter,
      saveLocation,
      saveProp,
      saveSceneShots,
      createProject,
    });

    expect(result.relativePath).toBe("characters/alice/voice.mp4");
    const reloaded = await loadProject(dataDir);
    expect(reloaded.characters[0]!.voice?.video).toBe(
      "characters/alice/voice.mp4",
    );
  });

  it("preserves an existing voice prompt/refName when uploading the video", async () => {
    // The YAML carries prompt+refName (video empty); the upload only sets video.
    writeCharacter("alice", ALICE_WITH_VOICE_PROMPT.replace('video: ""', "video: alice/voice-old.mp4"));
    const ctx = await setupHandler();

    await applyUpload({
      project: ctx.project,
      command: {
        slot: { kind: "character-voice", character: "alice" },
        originalFilename: "intro.mp4",
        data: Buffer.from("NEW"),
      },
      assetStore: ctx.assetStore,
      dataDir,
      saveCharacter,
      saveLocation,
      saveProp,
      saveSceneShots,
      createProject,
    });

    const reloaded = await loadProject(dataDir);
    const voice = reloaded.characters[0]!.voice;
    expect(voice?.video).toBe("characters/alice/voice.mp4");
    expect(voice?.prompt).toBe("자기소개 + 대사 믹스");
    expect(voice?.refName).toBe("p1_c_alice_voice");
  });
});

describe("applyUpload — shot frames", () => {
  it("sets startFrame on the shot, reloads with the new path", async () => {
    // writeMinimalScene (in setupHandler) creates scene s01-open with shot "01".
    const ctx = await setupHandler();

    const result = await applyUpload({
      project: ctx.project,
      command: {
        slot: { kind: "shot-start-frame", sceneSlug: "s01-open", shotId: "01" },
        originalFilename: "start.png",
        data: Buffer.from("START"),
      },
      assetStore: ctx.assetStore,
      dataDir,
      saveCharacter,
      saveLocation,
      saveProp,
      saveSceneShots,
      createProject,
    });

    expect(result.relativePath).toBe(
      "frames/scenes/s01-open/shots/01/start-frame.png",
    );
    const reloaded = await loadProject(dataDir);
    const shot = reloaded.scenes[0]!.shots[0]!;
    expect(shot.startFrame?.image).toBe(
      "frames/scenes/s01-open/shots/01/start-frame.png",
    );
    expect(shot.endFrame).toBeUndefined();
  });

  it("rejects a frame upload targeting an unknown shot", async () => {
    const ctx = await setupHandler();
    await expect(
      applyUpload({
        project: ctx.project,
        command: {
          slot: { kind: "shot-end-frame", sceneSlug: "s01-open", shotId: "99" },
          originalFilename: "e.png",
          data: Buffer.from("E"),
        },
        assetStore: ctx.assetStore,
        dataDir,
        saveCharacter,
        saveLocation,
        saveProp,
        saveSceneShots,
        createProject,
      }),
    ).rejects.toThrow(/unknown shot/i);
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
      saveSceneShots,
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
      saveSceneShots,
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
        saveSceneShots,
        createProject,
      }),
    ).rejects.toThrow(/reference.*ghost/i);
  });
});
