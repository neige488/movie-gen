/**
 * Voice blackify handler — derive black-screen+audio video from a voice clip.
 *
 * Integration test against real temp data/ + assets/, with a FAKE
 * VideoTransformer (records calls; no real ffmpeg) so the test is hermetic.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { loadProject } from "@adapter/project-repository.js";
import { saveCharacter } from "@adapter/project-writer.js";
import { createAssetStore } from "@adapter/asset-store.js";
import type { VideoTransformer } from "@adapter/video-transformer.js";
import { blackifyVoice, VoiceBlackifyError } from "./voice-blackify-handler.js";

let dataDir: string;
let assetsDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "moviegen-voice-data-"));
  assetsDir = mkdtempSync(path.join(tmpdir(), "moviegen-voice-assets-"));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(assetsDir, { recursive: true, force: true });
});

function writeCharacter(name: string, yaml: string): void {
  const dir = path.join(dataDir, "characters");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${name}.yaml`), yaml);
}

const ALICE_WITH_VOICE = `
name: alice
headshot:
  image: alice/headshot.png
voice:
  refName: p1_c_alice_voice
  video: characters/alice/voice.mp4
looks:
  - name: hoodie
    face:
      image: alice/hoodie/face.png
    body:
      image: alice/hoodie/body.png
`;

const ALICE_NO_VOICE = `
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

/** Records blackify(input, output) calls; performs no real work. */
function fakeTransformer(): VideoTransformer & {
  calls: { input: string; output: string }[];
} {
  const calls: { input: string; output: string }[] = [];
  return {
    calls,
    async blackify(input: string, output: string) {
      calls.push({ input, output });
    },
  };
}

describe("blackifyVoice", () => {
  it("runs the transformer and sets voice.blackVideo", async () => {
    writeCharacter("alice", ALICE_WITH_VOICE);
    const project = await loadProject(dataDir);
    const assetStore = createAssetStore(assetsDir);
    const transformer = fakeTransformer();

    const result = await blackifyVoice({
      project,
      characterName: "alice",
      assetStore,
      transformer,
      dataDir,
      saveCharacter,
    });

    expect(result.blackVideo).toBe("characters/alice/voice-black.mp4");

    // transformer called with absolute source → absolute black output.
    expect(transformer.calls).toHaveLength(1);
    expect(transformer.calls[0]!.input).toBe(
      assetStore.resolve("characters/alice/voice.mp4"),
    );
    expect(transformer.calls[0]!.output).toBe(
      assetStore.resolve("characters/alice/voice-black.mp4"),
    );

    // Persisted to YAML; source video + refName preserved.
    const reloaded = await loadProject(dataDir);
    const voice = reloaded.characters[0]!.voice;
    expect(voice?.blackVideo).toBe("characters/alice/voice-black.mp4");
    expect(voice?.video).toBe("characters/alice/voice.mp4");
    expect(voice?.refName).toBe("p1_c_alice_voice");
  });

  it("rejects when the character has no voice video", async () => {
    writeCharacter("alice", ALICE_NO_VOICE);
    const project = await loadProject(dataDir);
    const assetStore = createAssetStore(assetsDir);

    await expect(
      blackifyVoice({
        project,
        characterName: "alice",
        assetStore,
        transformer: fakeTransformer(),
        dataDir,
        saveCharacter,
      }),
    ).rejects.toThrow(VoiceBlackifyError);
  });

  it("rejects an unknown character", async () => {
    writeCharacter("alice", ALICE_WITH_VOICE);
    const project = await loadProject(dataDir);
    const assetStore = createAssetStore(assetsDir);

    await expect(
      blackifyVoice({
        project,
        characterName: "ghost",
        assetStore,
        transformer: fakeTransformer(),
        dataDir,
        saveCharacter,
      }),
    ).rejects.toThrow(/unknown character/i);
  });
});
