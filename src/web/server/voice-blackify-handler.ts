/**
 * Voice blackify handler — derive a "black frame + audio only" video from a
 * Character's voice self-intro clip.
 *
 * Flow:
 *  1. Locate the Character and its voice source video (reject if missing).
 *  2. Run the VideoTransformer (ffmpeg) src → black video at a deterministic
 *     path (`characters/<name>/voice-black.mp4`), overwriting any prior derive.
 *  3. Set `voice.blackVideo` via the domain mutator (re-validates invariants).
 *  4. Persist the Character YAML and return the rebuilt Project.
 *
 * Dependencies are injected so this stays unit-testable with a fake transformer.
 */

import path from "node:path";
import type { Character, Project } from "@domain/movie.js";
import { setCharacterVoice } from "@domain/movie.js";
import type { AssetStore } from "@adapter/asset-store.js";
import type { VideoTransformer } from "@adapter/video-transformer.js";

export class VoiceBlackifyError extends Error {
  public override readonly name = "VoiceBlackifyError";
}

export interface BlackifyVoiceDeps {
  project: Project;
  characterName: string;
  assetStore: AssetStore;
  transformer: VideoTransformer;
  dataDir: string;
  saveCharacter: (dataDir: string, c: Character) => Promise<void>;
}

export interface BlackifyVoiceResult {
  /** Relative path of the derived black video. */
  blackVideo: string;
  project: Project;
}

export async function blackifyVoice(
  deps: BlackifyVoiceDeps,
): Promise<BlackifyVoiceResult> {
  const { project, characterName, assetStore, transformer } = deps;

  const character = project.characters.find((c) => c.name === characterName);
  if (!character) {
    throw new VoiceBlackifyError(`unknown character "${characterName}"`);
  }
  if (!character.voice?.video) {
    throw new VoiceBlackifyError(
      `character "${characterName}" has no voice video to process`,
    );
  }

  const sourceAbs = assetStore.resolve(character.voice.video);
  const blackRel = path.posix.join(
    "characters",
    characterName,
    "voice-black.mp4",
  );
  const blackAbs = assetStore.resolve(blackRel);

  await transformer.blackify(sourceAbs, blackAbs);

  const next = setCharacterVoice(project, characterName, {
    ...character.voice,
    blackVideo: blackRel,
  });
  const updated = next.characters.find((c) => c.name === characterName);
  // updated is always present — setCharacterVoice preserves the character set.
  if (updated) await deps.saveCharacter(deps.dataDir, updated);

  return { blackVideo: blackRel, project: next };
}
