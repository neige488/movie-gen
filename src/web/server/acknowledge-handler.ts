/**
 * Acknowledge handler — orchestrators for the "Shot 확인됨" / "Take 확인됨"
 * actions (CONTEXT.md "작은 수정 → hash 갱신 (\"확인됨\" 액션)").
 *
 * Pattern mirrors starred-toggle-handler:
 *  1. Validate up-front (Scene/Shot/[Take] exists).
 *  2. Domain mutation via `acknowledgeShot` / `acknowledgeTake`.
 *  3. Persist the whole shots.yaml (cheap, single file) so a server restart
 *     reflects the new hash.
 *  4. Return the rebuilt Project so the HTTP layer can re-emit MovieDto.
 *
 * Orphan Shots reject — there is no "current" hash to acknowledge to. The
 * client UI hides the "확인됨" button on orphan Shots, but the handler
 * defends against any client that POSTs anyway.
 */

import {
  acknowledgeShot,
  acknowledgeTake,
  type Project,
  type Scene,
  type Shot,
} from "@domain/movie.js";

export class AcknowledgeError extends Error {
  public override readonly name = "AcknowledgeError";
}

export interface AcknowledgeResult {
  project: Project;
}

// ---------------------------------------------------------------------------
// applyAcknowledgeShot
// ---------------------------------------------------------------------------

export interface ApplyAcknowledgeShotDeps {
  project: Project;
  sceneSlug: string;
  shotId: string;
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
}

export async function applyAcknowledgeShot(
  deps: ApplyAcknowledgeShotDeps,
): Promise<AcknowledgeResult> {
  // Up-front validation so we don't write a partial yaml on a bad request.
  const scene = deps.project.scenes.find((s) => s.slug === deps.sceneSlug);
  if (!scene) {
    throw new AcknowledgeError(`unknown scene "${deps.sceneSlug}"`);
  }
  const shot = scene.shots.find((s) => s.id === deps.shotId);
  if (!shot) {
    throw new AcknowledgeError(
      `unknown shot "${deps.shotId}" in scene "${deps.sceneSlug}"`,
    );
  }

  // Domain mutation — re-validates the whole Project. Orphan rejects here
  // with DomainInvariantError, which we re-raise as AcknowledgeError so the
  // HTTP layer maps to a single 400 shape.
  let nextProject: Project;
  try {
    nextProject = acknowledgeShot(deps.project, deps.sceneSlug, deps.shotId);
  } catch (err) {
    throw new AcknowledgeError((err as Error).message);
  }

  const updatedScene = nextProject.scenes.find(
    (s) => s.slug === deps.sceneSlug,
  )!;
  await deps.saveSceneShots(deps.dataDir, scene.slug, updatedScene.shots);

  return { project: nextProject };
}

// ---------------------------------------------------------------------------
// applyAcknowledgeTake
// ---------------------------------------------------------------------------

export interface ApplyAcknowledgeTakeDeps {
  project: Project;
  sceneSlug: string;
  shotId: string;
  takeId: string;
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
}

export async function applyAcknowledgeTake(
  deps: ApplyAcknowledgeTakeDeps,
): Promise<AcknowledgeResult> {
  const scene = deps.project.scenes.find((s) => s.slug === deps.sceneSlug);
  if (!scene) {
    throw new AcknowledgeError(`unknown scene "${deps.sceneSlug}"`);
  }
  const shot = scene.shots.find((s) => s.id === deps.shotId);
  if (!shot) {
    throw new AcknowledgeError(
      `unknown shot "${deps.shotId}" in scene "${deps.sceneSlug}"`,
    );
  }
  if (!shot.takes.some((t) => t.id === deps.takeId)) {
    throw new AcknowledgeError(
      `unknown take "${deps.takeId}" in shot "${deps.shotId}" (scene "${deps.sceneSlug}")`,
    );
  }

  let nextProject: Project;
  try {
    nextProject = acknowledgeTake(
      deps.project,
      deps.sceneSlug,
      deps.shotId,
      deps.takeId,
    );
  } catch (err) {
    throw new AcknowledgeError((err as Error).message);
  }

  const updatedScene = nextProject.scenes.find(
    (s) => s.slug === deps.sceneSlug,
  )!;
  await deps.saveSceneShots(deps.dataDir, scene.slug, updatedScene.shots);

  return { project: nextProject };
}
