/**
 * ProjectWriter — write domain objects back to YAML files under `data/`.
 *
 * Complements ProjectRepository's load functions.
 *
 * Slice #2 added Character/Location/Prop writers.
 * Slice #3 adds saveSceneShots — write back the shots.yaml for one Scene so
 *   we can append Takes after upload. Only `shots.yaml` is touched; scene.yaml
 *   and screenplay.md are left alone (Takes do not modify the screenplay).
 *
 * Path layout (mirrors ProjectRepository):
 *   data/characters/<name>.yaml
 *   data/locations/<name>.yaml
 *   data/props/<name>.yaml
 *   data/scenes/<slug>/shots.yaml
 *
 * Per ADR 0001, last-write-wins. Single-user assumption — no locking.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import type {
  Character,
  ImageReference,
  Location,
  Prop,
  Shot,
  VoiceReference,
} from "@domain/movie.js";

/** Serialize an ImageReference, omitting undefined optionals for clean diffs. */
function imageRefToYaml(r: ImageReference): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (r.name !== undefined) out.name = r.name;
  if (r.refName !== undefined) out.refName = r.refName;
  if (r.prompt !== undefined) out.prompt = r.prompt;
  out.image = r.image;
  return out;
}

/** Serialize a VoiceReference, omitting undefined optionals for clean diffs. */
function voiceRefToYaml(v: VoiceReference): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (v.refName !== undefined) out.refName = v.refName;
  if (v.prompt !== undefined) out.prompt = v.prompt;
  out.video = v.video;
  if (v.blackVideo !== undefined) out.blackVideo = v.blackVideo;
  return out;
}

export async function saveCharacter(
  dataDir: string,
  character: Character,
): Promise<void> {
  const dir = path.join(dataDir, "characters");
  await mkdir(dir, { recursive: true });
  const payload = {
    name: character.name,
    headshot: imageRefToYaml(character.headshot),
    ...(character.voice !== undefined
      ? { voice: voiceRefToYaml(character.voice) }
      : {}),
    looks: character.looks.map((l) => ({
      name: l.name,
      face: imageRefToYaml(l.face),
      body: imageRefToYaml(l.body),
      ...(l.uniform !== undefined ? { uniform: imageRefToYaml(l.uniform) } : {}),
    })),
  };
  await writeFile(
    path.join(dir, `${character.name}.yaml`),
    yaml.dump(payload, { lineWidth: 120, noRefs: true }),
    "utf8",
  );
}

export async function saveLocation(
  dataDir: string,
  location: Location,
): Promise<void> {
  const dir = path.join(dataDir, "locations");
  await mkdir(dir, { recursive: true });
  const payload = {
    name: location.name,
    references: location.references.map(imageRefToYaml),
  };
  await writeFile(
    path.join(dir, `${location.name}.yaml`),
    yaml.dump(payload, { lineWidth: 120, noRefs: true }),
    "utf8",
  );
}

export async function saveProp(dataDir: string, prop: Prop): Promise<void> {
  const dir = path.join(dataDir, "props");
  await mkdir(dir, { recursive: true });
  const payload = {
    name: prop.name,
    references: prop.references.map(imageRefToYaml),
  };
  await writeFile(
    path.join(dir, `${prop.name}.yaml`),
    yaml.dump(payload, { lineWidth: 120, noRefs: true }),
    "utf8",
  );
}

/**
 * Persist a Scene's `scene.yaml` (slugline + isStarred). Used by the starred
 * toggle (slice #4) — `screenplay.md` and `shots.yaml` are not touched. The
 * on-disk shape matches `sceneFileSchema`.
 *
 * The Scene's slug is implicit in the folder name and never written into
 * scene.yaml itself.
 */
export async function saveSceneFile(
  dataDir: string,
  sceneSlug: string,
  payload: { slugline: string; isStarred: boolean },
): Promise<void> {
  const dir = path.join(dataDir, "scenes", sceneSlug);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "scene.yaml"),
    yaml.dump(
      { slugline: payload.slugline, isStarred: payload.isStarred },
      { lineWidth: 120, noRefs: true },
    ),
    "utf8",
  );
}

/**
 * Persist a Scene's shots.yaml. Used to append/modify Takes (slice #3) and
 * later Shot-prompt edits (slice #7). The screenplay.md and scene.yaml are
 * not touched here.
 *
 * The on-disk shape matches `shotsFileSchema` in `schemas.ts`. Optional
 * fields are omitted (not written as `null`/`undefined`) so the YAML stays
 * easy to diff and Claude Code can edit it cleanly.
 */
export async function saveSceneShots(
  dataDir: string,
  sceneSlug: string,
  shots: readonly Shot[],
): Promise<void> {
  const dir = path.join(dataDir, "scenes", sceneSlug);
  await mkdir(dir, { recursive: true });
  const payload = {
    shots: shots.map((s) => {
      const out: Record<string, unknown> = {
        id: s.id,
        prompt: s.prompt,
        duration: s.duration,
        screenplayHash: s.screenplayHash,
      };
      if (s.prevShotRef !== undefined) out.prevShotRef = s.prevShotRef;
      out.characterRefs = s.characterRefs.map((r) => ({
        character: r.character,
        look: r.look,
      }));
      out.locationRefs = s.locationRefs.map((r) => {
        const refOut: Record<string, unknown> = { location: r.location };
        if (r.reference !== undefined) refOut.reference = r.reference;
        return refOut;
      });
      out.propRefs = s.propRefs.map((r) => {
        const refOut: Record<string, unknown> = { prop: r.prop };
        if (r.reference !== undefined) refOut.reference = r.reference;
        return refOut;
      });
      out.takes = s.takes.map((t) => ({
        id: t.id,
        videoPath: t.videoPath,
        screenplayHash: t.screenplayHash,
        createdAt: t.createdAt,
        isStarred: t.isStarred,
      }));
      return out;
    }),
  };
  await writeFile(
    path.join(dir, "shots.yaml"),
    yaml.dump(payload, { lineWidth: 120, noRefs: true }),
    "utf8",
  );
}
