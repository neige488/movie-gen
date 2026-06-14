/**
 * Reorder handler — move a Scene one step earlier/later in the manifest.
 *
 * This is the Scenes-view reorder entry point. It moves a Scene one position in
 * the linear sequence: within its act when there's room, and **across the act
 * boundary at the edges** — the first Scene of an act moves up into the end of
 * the previous act, the last Scene moves down into the start of the next act.
 * (The scene-nav shows act-divider headers, so crossing a boundary with ▲/▼ is
 * the natural complement to the canvas drag.) Only the very first Scene (act 1)
 * moving up and the very last (act 3) moving down are no-ops.
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
  type ActId,
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

  // Compute the target act + index. Within the act when there's room; at the
  // act's edge, cross into the adjacent act (prev act's end / next act's start).
  // Only the global ends (act 1 first ↑ / act 3 last ↓) have nowhere to go.
  const actScenes = arrangement.scenesInAct(actId);
  const currentIndex = actScenes.indexOf(sceneSlug);

  let targetAct: ActId = actId;
  let targetIndex: number;
  if (direction === "up") {
    if (currentIndex > 0) {
      targetIndex = currentIndex - 1;
    } else if (actId > 1) {
      targetAct = (actId - 1) as ActId;
      targetIndex = arrangement.scenesInAct(targetAct).length; // append to prev act
    } else {
      return { project: deps.project, arrangement }; // first of act 1 — no-op
    }
  } else {
    if (currentIndex < actScenes.length - 1) {
      targetIndex = currentIndex + 1;
    } else if (actId < 3) {
      targetAct = (actId + 1) as ActId;
      targetIndex = 0; // start of next act
    } else {
      return { project: deps.project, arrangement }; // last of act 3 — no-op
    }
  }

  let nextArrangement: MovieArrangement;
  try {
    nextArrangement = arrangement.moveScene(sceneSlug, targetAct, targetIndex);
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
