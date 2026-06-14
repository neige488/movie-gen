/**
 * Reorder handler — move a Scene one step earlier/later in the manifest.
 *
 * This is the Scenes-view reorder entry point for slice #19. It moves a Scene
 * one position within ITS OWN act (per ADR 0002 the Scenes view only changes
 * order; cross-act moves are the BS2 canvas's drag job — issue #21). Because
 * the initial migration drops every Scene into act 1, "up/down" in the Scenes
 * view is effectively within-act reordering of the whole sequence.
 *
 * Pattern mirrors starred-toggle-handler: pure DI, domain mutation via
 * `MovieArrangement.moveScene`, then persist the manifest (atomic) + rebuild
 * the in-memory Project from disk so /api/movie sees the new order. The
 * rebuild also re-runs reconcile, keeping disk and memory in lock-step.
 *
 * The handler returns BOTH the new Project (for the MovieDto reply) and the
 * new arrangement (so main.ts can keep its in-memory arrangement binding fresh
 * without a second load).
 */

import type { Project } from "@domain/movie.js";
import {
  MovieArrangementError,
  type MovieArrangement,
} from "@domain/movie-arrangement.js";

export class ReorderError extends Error {
  public override readonly name = "ReorderError";
}

export type ReorderDirection = "up" | "down";

export interface ApplyReorderSceneDeps {
  project: Project;
  arrangement: MovieArrangement;
  sceneSlug: string;
  /** "up" = one step earlier in the sequence, "down" = one step later. */
  direction: ReorderDirection;
  dataDir: string;
  saveArrangement: (
    dataDir: string,
    arrangement: MovieArrangement,
  ) => Promise<void>;
  loadProject: (dataDir: string) => Promise<Project>;
}

export interface ReorderResult {
  project: Project;
  arrangement: MovieArrangement;
}

export async function applyReorderScene(
  deps: ApplyReorderSceneDeps,
): Promise<ReorderResult> {
  const { arrangement, sceneSlug, direction } = deps;

  const actId = arrangement.actOf(sceneSlug);
  if (actId === undefined) {
    throw new ReorderError(`unknown scene "${sceneSlug}" in the arrangement`);
  }

  // Move within the SAME act only (cross-act = #21). Compute the target index
  // from the current within-act position; moveScene clamps it into range, so a
  // move past either end is a harmless no-op.
  const actScenes = arrangement.scenesInAct(actId);
  const currentIndex = actScenes.indexOf(sceneSlug);
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

  let nextArrangement: MovieArrangement;
  try {
    nextArrangement = arrangement.moveScene(sceneSlug, actId, targetIndex);
  } catch (err) {
    if (err instanceof MovieArrangementError) {
      throw new ReorderError(err.message);
    }
    throw err;
  }

  // Persist the manifest (atomic) then rebuild the Project from disk so the
  // in-memory order matches the freshly written manifest.
  await deps.saveArrangement(deps.dataDir, nextArrangement);
  const nextProject = await deps.loadProject(deps.dataDir);

  return { project: nextProject, arrangement: nextArrangement };
}
