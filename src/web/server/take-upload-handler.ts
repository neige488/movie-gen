/**
 * Take upload handler — the domain-aware orchestrator for POST /api/takes/upload.
 *
 * Given (sceneSlug, shotId, originalFilename, data):
 *  1. Validate the Scene + Shot exist in the loaded Project.
 *  2. Find the matching marker block(s) in the Scene's screenplay and compute
 *     the current screenplayHash — this is the snapshot pinned on the new
 *     Take so future sync evaluation can flag staleness (CONTEXT.md "Sync via
 *     hash").
 *  3. Allocate the next Take id (`take-NNN`, zero-padded) by scanning the
 *     existing Take ids on this Shot and picking max+1. We do NOT renumber
 *     existing ids — Takes are immutable.
 *  4. Upload the binary via AssetStore.upload (take-video slot).
 *  5. Append a new Take (isStarred=false, createdAt=clock()) to the Shot.
 *  6. Persist via saveSceneShots.
 *  7. Rebuild the Project (re-validate invariants) and return it + the new
 *     Take record.
 *
 * Dependencies are injected so this module stays unit-testable end-to-end
 * against a real temp filesystem (see take-upload-handler.test.ts). The clock
 * dependency lets tests pin createdAt to a known timestamp.
 */

import {
  createTake,
  type Project,
  type Scene,
  type Shot,
  type Take,
} from "@domain/movie.js";
import { computeScreenplayHash } from "@domain/hash-calculator.js";
import { parseShotMarkers } from "@domain/marker-parser.js";
import type { AssetStore } from "@adapter/asset-store.js";

export class TakeUploadError extends Error {
  public override readonly name = "TakeUploadError";
}

export interface TakeUploadCommand {
  sceneSlug: string;
  shotId: string;
  originalFilename: string;
  data: Buffer;
}

export interface ApplyTakeUploadDeps {
  project: Project;
  command: TakeUploadCommand;
  assetStore: AssetStore;
  dataDir: string;
  saveSceneShots: (
    dataDir: string,
    sceneSlug: string,
    shots: readonly Shot[],
  ) => Promise<void>;
  createProject: (input: {
    scenes: readonly Scene[];
    characters: readonly Project["characters"][number][];
    locations: readonly Project["locations"][number][];
    props: readonly Project["props"][number][];
  }) => Project;
  /** Pure injection seam so tests can pin createdAt. */
  clock: () => Date;
}

export interface TakeUploadResult {
  take: Take;
  project: Project;
}

export async function applyTakeUpload(
  deps: ApplyTakeUploadDeps,
): Promise<TakeUploadResult> {
  const { project, command, assetStore } = deps;

  const scene = project.scenes.find((s) => s.slug === command.sceneSlug);
  if (!scene) {
    throw new TakeUploadError(`unknown scene "${command.sceneSlug}"`);
  }
  const shot = scene.shots.find((s) => s.id === command.shotId);
  if (!shot) {
    throw new TakeUploadError(
      `unknown shot "${command.shotId}" in scene "${command.sceneSlug}"`,
    );
  }

  const currentHash = currentScreenplayHashForShot(scene, shot.id);
  if (currentHash === null) {
    throw new TakeUploadError(
      `shot "${shot.id}" is an orphan — no matching <!-- shot:${shot.id} --> marker block in scene "${scene.slug}"`,
    );
  }

  const takeId = allocateTakeId(shot.takes);

  const videoPath = await assetStore.upload(
    {
      kind: "take-video",
      sceneSlug: scene.slug,
      shotId: shot.id,
      takeId,
    },
    command.originalFilename,
    command.data,
  );

  const newTake = createTake({
    id: takeId,
    videoPath,
    screenplayHash: currentHash,
    createdAt: deps.clock().toISOString(),
    isStarred: false,
  });

  const updatedShot: Shot = {
    ...shot,
    takes: [...shot.takes, newTake],
  };
  const updatedShots = scene.shots.map((s) =>
    s.id === shot.id ? updatedShot : s,
  );

  await deps.saveSceneShots(deps.dataDir, scene.slug, updatedShots);

  // Rebuild Scene then Project (revalidate invariants end-to-end).
  const updatedScene: Scene = { ...scene, shots: updatedShots };
  const nextScenes = project.scenes.map((s) =>
    s.slug === scene.slug ? updatedScene : s,
  );
  const nextProject = deps.createProject({
    scenes: nextScenes,
    characters: project.characters,
    locations: project.locations,
    props: project.props,
  });

  return { take: newTake, project: nextProject };
}

/**
 * Re-compute the marker-block hash for the given shotId from the current
 * screenplay text. Mirrors `evaluateSceneSync` — concatenates multi-block
 * texts with a blank line separator so multi-block Shots stay canonical.
 *
 * Returns `null` if no marker block exists for this shotId (orphan).
 */
function currentScreenplayHashForShot(
  scene: Scene,
  shotId: string,
): string | null {
  const blocks = parseShotMarkers(scene.screenplay);
  const texts = blocks.filter((b) => b.shotId === shotId).map((b) => b.text);
  if (texts.length === 0) return null;
  return computeScreenplayHash(texts.join("\n\n"));
}

/**
 * Allocate the next `take-NNN` id. Scans existing Take ids that match the
 * `take-<digits>` pattern and returns one above the max. Non-conforming
 * existing ids (e.g. legacy "t01" from fixtures) are ignored when computing
 * max so we never collide; existing ids are never renamed.
 */
function allocateTakeId(existing: readonly Take[]): string {
  let max = 0;
  for (const t of existing) {
    const m = /^take-(\d+)$/.exec(t.id);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  const next = max + 1;
  return `take-${String(next).padStart(3, "0")}`;
}
