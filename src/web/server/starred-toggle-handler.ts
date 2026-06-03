/**
 * Starred-toggle handler — orchestrators for the Scene and Take starred flags.
 *
 * Mirrors the take-upload-handler pattern: pure DI, domain mutation via the
 * `setSceneStarred` / `setTakeStarred` factories, then persist + rebuild the
 * in-memory Project.
 *
 *   Scene variant  →  scene.yaml only (saveSceneFile)
 *   Take  variant  →  shots.yaml only (saveSceneShots) — also rewrites the
 *                     sibling Take that lost its star, so disk and memory
 *                     stay in lock-step with the Shot-level invariant.
 *
 * Both endpoints return the full updated Project so the caller can re-render
 * the movie sequence (Scene toggle changes ordering, Take toggle changes
 * which Take chains forward in slice #8).
 */

import {
  setSceneStarred,
  setTakeStarred,
  type Project,
  type Scene,
  type Shot,
} from "@domain/movie.js";

export class StarredToggleError extends Error {
  public override readonly name = "StarredToggleError";
}

// ---------------------------------------------------------------------------
// Scene starred
// ---------------------------------------------------------------------------

export interface ApplyToggleSceneStarredDeps {
  project: Project;
  sceneSlug: string;
  isStarred: boolean;
  dataDir: string;
  saveSceneFile: (
    dataDir: string,
    sceneSlug: string,
    payload: { slugline: string; isStarred: boolean },
  ) => Promise<void>;
  createProject: (input: {
    scenes: readonly Scene[];
    characters: readonly Project["characters"][number][];
    locations: readonly Project["locations"][number][];
    props: readonly Project["props"][number][];
  }) => Project;
}

export interface ToggleResult {
  project: Project;
}

export async function applyToggleSceneStarred(
  deps: ApplyToggleSceneStarredDeps,
): Promise<ToggleResult> {
  const scene = deps.project.scenes.find((s) => s.slug === deps.sceneSlug);
  if (!scene) {
    throw new StarredToggleError(`unknown scene "${deps.sceneSlug}"`);
  }

  // Domain mutation first — re-validates the Project shape.
  let nextProject: Project;
  try {
    nextProject = setSceneStarred(
      deps.project,
      deps.sceneSlug,
      deps.isStarred,
    );
  } catch (err) {
    // Surface as StarredToggleError so the HTTP layer can map to a 400.
    throw new StarredToggleError((err as Error).message);
  }

  // Persist the on-disk scene.yaml.
  await deps.saveSceneFile(deps.dataDir, scene.slug, {
    slugline: scene.slugline,
    isStarred: deps.isStarred,
  });

  return { project: nextProject };
}

// ---------------------------------------------------------------------------
// Take starred
// ---------------------------------------------------------------------------

export interface ApplyToggleTakeStarredDeps {
  project: Project;
  sceneSlug: string;
  shotId: string;
  takeId: string;
  isStarred: boolean;
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

export async function applyToggleTakeStarred(
  deps: ApplyToggleTakeStarredDeps,
): Promise<ToggleResult> {
  // Validate up-front so the persistence layer can rely on a known target.
  const scene = deps.project.scenes.find((s) => s.slug === deps.sceneSlug);
  if (!scene) {
    throw new StarredToggleError(`unknown scene "${deps.sceneSlug}"`);
  }
  const shot = scene.shots.find((s) => s.id === deps.shotId);
  if (!shot) {
    throw new StarredToggleError(
      `unknown shot "${deps.shotId}" in scene "${deps.sceneSlug}"`,
    );
  }
  if (!shot.takes.some((t) => t.id === deps.takeId)) {
    throw new StarredToggleError(
      `unknown take "${deps.takeId}" in shot "${deps.shotId}" (scene "${deps.sceneSlug}")`,
    );
  }

  // Domain mutation enforces the Shot ≤1 starred invariant — including the
  // auto-OFF of any previously starred sibling Take.
  let nextProject: Project;
  try {
    nextProject = setTakeStarred(
      deps.project,
      deps.sceneSlug,
      deps.shotId,
      deps.takeId,
      deps.isStarred,
    );
  } catch (err) {
    throw new StarredToggleError((err as Error).message);
  }

  // Persist the whole shots.yaml (cheap, single file) so the sibling auto-OFF
  // is written to disk too. Without this, an in-memory toggle would diverge
  // from the YAML on the next reload.
  const updatedScene = nextProject.scenes.find(
    (s) => s.slug === deps.sceneSlug,
  )!;
  await deps.saveSceneShots(deps.dataDir, scene.slug, updatedScene.shots);

  return { project: nextProject };
}
