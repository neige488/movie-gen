/**
 * Shot-edit handler — orchestrators for Slice 7 (Shot meta edit).
 *
 * Five operations live here, sharing the same DI pattern used by
 * acknowledge-handler / light-edit-handler:
 *  - applyShotPromptEdit         → shots.yaml only (prompt)
 *  - applyShotDurationEdit       → shots.yaml only (duration; domain enforces [4,15])
 *  - applyShotCharacterRefsEdit  → shots.yaml only (character refs; ref integrity)
 *  - applyShotLocationRefsEdit   → shots.yaml only (location refs; ref integrity)
 *  - applyShotPropRefsEdit       → shots.yaml only (prop refs; ref integrity)
 *
 * Decision (In-flight #1): one HTTP endpoint per field, mirroring the
 * slugline/screenplay split from Slice 5. Same DI shape per call so the HTTP
 * layer wiring stays uniform.
 *
 * All return the rebuilt Project so the HTTP layer re-emits MovieDto in one
 * round-trip (matches starred-toggle / acknowledge pattern). All errors
 * surface as ShotEditError so the HTTP layer maps any client-actionable
 * failure to a single 400 shape.
 */

import {
  setShotPrompt,
  setShotDuration,
  setShotPrevShotRef,
  setShotCharacterRefs,
  setShotLocationRefs,
  setShotPropRefs,
  type CharacterRef,
  type LocationRef,
  type Project,
  type PropRef,
  type Scene,
  type Shot,
} from "@domain/movie.js";

export class ShotEditError extends Error {
  public override readonly name = "ShotEditError";
}

export interface ShotEditResult {
  project: Project;
}

interface CommonDeps {
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

/**
 * Internal helper — find Shot, run the domain mutator, persist the whole
 * shots.yaml, return the rebuilt Project. Re-raises DomainInvariantError as
 * ShotEditError so the HTTP layer can pick a single error class.
 */
async function runShotEdit(
  deps: CommonDeps,
  mutate: (project: Project) => Project,
): Promise<ShotEditResult> {
  const scene = deps.project.scenes.find((s) => s.slug === deps.sceneSlug);
  if (!scene) {
    throw new ShotEditError(`unknown scene "${deps.sceneSlug}"`);
  }
  if (!scene.shots.some((s) => s.id === deps.shotId)) {
    throw new ShotEditError(
      `unknown shot "${deps.shotId}" in scene "${deps.sceneSlug}"`,
    );
  }

  let nextProject: Project;
  try {
    nextProject = mutate(deps.project);
  } catch (err) {
    throw new ShotEditError((err as Error).message);
  }

  const updatedScene = nextProject.scenes.find(
    (s) => s.slug === deps.sceneSlug,
  )!;
  await deps.saveSceneShots(deps.dataDir, scene.slug, updatedScene.shots);

  return { project: nextProject };
}

// ---------------------------------------------------------------------------
// applyShotPromptEdit
// ---------------------------------------------------------------------------

export interface ApplyShotPromptEditDeps extends CommonDeps {
  prompt: string;
}

export async function applyShotPromptEdit(
  deps: ApplyShotPromptEditDeps,
): Promise<ShotEditResult> {
  return runShotEdit(deps, (project) =>
    setShotPrompt(project, deps.sceneSlug, deps.shotId, deps.prompt),
  );
}

// ---------------------------------------------------------------------------
// applyShotDurationEdit
// ---------------------------------------------------------------------------

export interface ApplyShotDurationEditDeps extends CommonDeps {
  duration: number;
}

export async function applyShotDurationEdit(
  deps: ApplyShotDurationEditDeps,
): Promise<ShotEditResult> {
  return runShotEdit(deps, (project) =>
    setShotDuration(project, deps.sceneSlug, deps.shotId, deps.duration),
  );
}

// ---------------------------------------------------------------------------
// applyShotCharacterRefsEdit
// ---------------------------------------------------------------------------

export interface ApplyShotCharacterRefsEditDeps extends CommonDeps {
  refs: readonly CharacterRef[];
}

export async function applyShotCharacterRefsEdit(
  deps: ApplyShotCharacterRefsEditDeps,
): Promise<ShotEditResult> {
  return runShotEdit(deps, (project) =>
    setShotCharacterRefs(project, deps.sceneSlug, deps.shotId, deps.refs),
  );
}

// ---------------------------------------------------------------------------
// applyShotLocationRefsEdit
// ---------------------------------------------------------------------------

export interface ApplyShotLocationRefsEditDeps extends CommonDeps {
  refs: readonly LocationRef[];
}

export async function applyShotLocationRefsEdit(
  deps: ApplyShotLocationRefsEditDeps,
): Promise<ShotEditResult> {
  return runShotEdit(deps, (project) =>
    setShotLocationRefs(project, deps.sceneSlug, deps.shotId, deps.refs),
  );
}

// ---------------------------------------------------------------------------
// applyShotPrevShotRefEdit — Slice 8 (Chaining)
//
// `prevShotRef: string | null` — string sets the chain, null clears it.
// The domain mutator (setShotPrevShotRef) handles all invariants via the same
// `rebuildShotIn` helper used by Slice 7 mutators; no extra validation here.
// Persistence goes through saveSceneShots (shots.yaml only — scene.yaml and
// screenplay.md untouched).
// ---------------------------------------------------------------------------

export interface ApplyShotPrevShotRefEditDeps extends CommonDeps {
  prevShotRef: string | null;
}

export async function applyShotPrevShotRefEdit(
  deps: ApplyShotPrevShotRefEditDeps,
): Promise<ShotEditResult> {
  return runShotEdit(deps, (project) =>
    setShotPrevShotRef(project, deps.sceneSlug, deps.shotId, deps.prevShotRef),
  );
}

// ---------------------------------------------------------------------------
// applyShotPropRefsEdit
// ---------------------------------------------------------------------------

export interface ApplyShotPropRefsEditDeps extends CommonDeps {
  refs: readonly PropRef[];
}

export async function applyShotPropRefsEdit(
  deps: ApplyShotPropRefsEditDeps,
): Promise<ShotEditResult> {
  return runShotEdit(deps, (project) =>
    setShotPropRefs(project, deps.sceneSlug, deps.shotId, deps.refs),
  );
}
