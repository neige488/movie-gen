/**
 * Light-edit handler — orchestrators for Slice 5 (Light edit).
 *
 * Three operations live here, sharing the same DI pattern used by
 * starred-toggle-handler:
 *  - applySluglineEdit    → scene.yaml only (slugline field)
 *  - applyScreenplayEdit  → screenplay.md only (with marker consistency
 *                           validation: strict shotId set match — see
 *                           `marker-parser.validateMarkerConsistency`)
 *  - applySceneCopy       → clone the Scene folder (scene.yaml + screenplay.md
 *                           + shots.yaml) under a new slug, force
 *                           `isStarred=false`, then reload the Project so the
 *                           in-memory state matches disk (creating a new
 *                           Scene aggregate requires re-reading shots.yaml
 *                           which we don't want to duplicate here).
 *
 * All three return the full updated Project so the HTTP layer can re-emit
 * the MovieDto in one round-trip (mirrors the starred-toggle pattern).
 *
 * Errors all surface as LightEditError so the HTTP layer maps any
 * client-actionable failure (unknown scene, malformed markers, slug
 * collision, empty slugline) to a single 400 shape with a message field.
 */

import {
  setSceneSlugline,
  setSceneScreenplay,
  type Project,
  type Scene,
} from "@domain/movie.js";
import {
  validateMarkerConsistency,
  MarkerConsistencyError,
} from "@domain/marker-parser.js";
import { ScreenplayWriterError } from "@adapter/screenplay-writer.js";
import { SceneCopierError } from "@adapter/scene-copier.js";

export class LightEditError extends Error {
  public override readonly name = "LightEditError";
}

export interface LightEditResult {
  project: Project;
}

// ---------------------------------------------------------------------------
// applySluglineEdit
// ---------------------------------------------------------------------------

export interface ApplySluglineEditDeps {
  project: Project;
  sceneSlug: string;
  slugline: string;
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

export async function applySluglineEdit(
  deps: ApplySluglineEditDeps,
): Promise<LightEditResult> {
  const scene = deps.project.scenes.find((s) => s.slug === deps.sceneSlug);
  if (!scene) {
    throw new LightEditError(`unknown scene "${deps.sceneSlug}"`);
  }
  // Reject whitespace-only edits up-front — createScene also rejects empty,
  // but we want a clearer message than the domain layer's.
  const trimmed = deps.slugline.trim();
  if (trimmed.length === 0) {
    throw new LightEditError(`slugline must not be empty`);
  }

  let nextProject: Project;
  try {
    nextProject = setSceneSlugline(deps.project, deps.sceneSlug, deps.slugline);
  } catch (err) {
    throw new LightEditError((err as Error).message);
  }

  await deps.saveSceneFile(deps.dataDir, scene.slug, {
    slugline: deps.slugline,
    isStarred: scene.isStarred,
  });

  return { project: nextProject };
}

// ---------------------------------------------------------------------------
// applyScreenplayEdit
// ---------------------------------------------------------------------------

export interface ApplyScreenplayEditDeps {
  project: Project;
  sceneSlug: string;
  markdown: string;
  dataDir: string;
  saveScreenplay: (
    dataDir: string,
    sceneSlug: string,
    markdown: string,
  ) => Promise<void>;
  createProject: (input: {
    scenes: readonly Scene[];
    characters: readonly Project["characters"][number][];
    locations: readonly Project["locations"][number][];
    props: readonly Project["props"][number][];
  }) => Project;
}

export async function applyScreenplayEdit(
  deps: ApplyScreenplayEditDeps,
): Promise<LightEditResult> {
  const scene = deps.project.scenes.find((s) => s.slug === deps.sceneSlug);
  if (!scene) {
    throw new LightEditError(`unknown scene "${deps.sceneSlug}"`);
  }

  // Marker consistency: strict shot-id set match. Adding/removing Shots
  // belongs to Claude Code (PRD Out of scope for Light edit slice).
  const expectedShotIds = scene.shots.map((s) => s.id);
  try {
    validateMarkerConsistency(deps.markdown, expectedShotIds);
  } catch (err) {
    if (err instanceof MarkerConsistencyError) {
      throw new LightEditError(err.message);
    }
    throw err;
  }

  // Domain mutation — re-validates the Project shape (ref integrity, etc.).
  let nextProject: Project;
  try {
    nextProject = setSceneScreenplay(
      deps.project,
      deps.sceneSlug,
      deps.markdown,
    );
  } catch (err) {
    throw new LightEditError((err as Error).message);
  }

  try {
    await deps.saveScreenplay(deps.dataDir, scene.slug, deps.markdown);
  } catch (err) {
    if (err instanceof ScreenplayWriterError) {
      throw new LightEditError(err.message);
    }
    throw err;
  }

  return { project: nextProject };
}

// ---------------------------------------------------------------------------
// applySceneCopy
// ---------------------------------------------------------------------------

export interface ApplySceneCopyDeps {
  project: Project;
  sourceSlug: string;
  newSlug: string;
  dataDir: string;
  copyScene: (
    dataDir: string,
    sourceSlug: string,
    newSlug: string,
  ) => Promise<void>;
  loadProject: (dataDir: string) => Promise<Project>;
}

export interface SceneCopyResult extends LightEditResult {
  newSlug: string;
}

export async function applySceneCopy(
  deps: ApplySceneCopyDeps,
): Promise<SceneCopyResult> {
  const source = deps.project.scenes.find((s) => s.slug === deps.sourceSlug);
  if (!source) {
    throw new LightEditError(`unknown scene "${deps.sourceSlug}"`);
  }

  try {
    await deps.copyScene(deps.dataDir, deps.sourceSlug, deps.newSlug);
  } catch (err) {
    if (err instanceof SceneCopierError) {
      throw new LightEditError(err.message);
    }
    throw err;
  }

  // Reload the whole Project so the new Scene aggregate is constructed via
  // the canonical loadProject path — that picks up the cloned shots.yaml +
  // screenplay.md without us having to re-implement parsing here.
  const nextProject = await deps.loadProject(deps.dataDir);
  return { project: nextProject, newSlug: deps.newSlug };
}
