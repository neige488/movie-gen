/**
 * Move-scene handler — BS2 canvas drag (slice #21).
 *
 * The canvas lets the director drag a Scene block (a) within an act row to
 * reorder it, or (b) onto another act row to re-place it. This is the entry
 * point for that: it moves a Scene to an arbitrary `toActId` at a *visible*
 * drop position (`beforeSlug` = the starred slug to land ahead of, or null for
 * the end of that act's visible row) via `MovieArrangement.moveScene`, which
 * enforces the act-sequential invariant (ADR 0002). It then persists the
 * manifest (atomic) and rebuilds the in-memory Project from disk so the new
 * placement survives a refresh — exactly the reorder-handler shape, just with
 * cross-act moves allowed.
 *
 * The visible drop position is resolved to a FULL-manifest index by
 * `resolveCanvasDropIndex` so interleaved non-starred Scenes keep their
 * relative slots (see canvas-move.ts).
 */

import type { Project } from "@domain/movie.js";
import {
  MovieArrangementError,
  type ActId,
  type MovieArrangement,
} from "@domain/movie-arrangement.js";
import { resolveCanvasDropIndex, CanvasMoveError } from "./canvas-move.js";

export class MoveSceneError extends Error {
  public override readonly name = "MoveSceneError";
}

export interface ApplyMoveSceneDeps {
  project: Project;
  arrangement: MovieArrangement;
  sceneSlug: string;
  /** Destination act (1, 2, or 3). May equal the source act (= reorder). */
  toActId: ActId;
  /**
   * The starred slug the dragged block was dropped *before*, or null for the
   * end of the destination act's visible (starred) row.
   */
  beforeSlug: string | null;
  dataDir: string;
  saveArrangement: (
    dataDir: string,
    arrangement: MovieArrangement,
  ) => Promise<void>;
  loadProject: (dataDir: string) => Promise<Project>;
}

export interface MoveSceneResult {
  project: Project;
  arrangement: MovieArrangement;
}

export async function applyMoveScene(
  deps: ApplyMoveSceneDeps,
): Promise<MoveSceneResult> {
  const { arrangement, sceneSlug, toActId, beforeSlug } = deps;

  if (arrangement.actOf(sceneSlug) === undefined) {
    throw new MoveSceneError(`unknown scene "${sceneSlug}" in the arrangement`);
  }
  if (toActId !== 1 && toActId !== 2 && toActId !== 3) {
    throw new MoveSceneError(`invalid act id ${toActId} (must be 1, 2, or 3)`);
  }

  // Resolve the visible drop position into a full-manifest index. Starred set
  // comes from the Project (isStarred owns canvas visibility, ADR 0002).
  const starred = new Set(
    deps.project.scenes.filter((s) => s.isStarred).map((s) => s.slug),
  );
  const targetActSlugs = arrangement.scenesInAct(toActId);

  let toIndex: number;
  try {
    toIndex = resolveCanvasDropIndex(
      targetActSlugs,
      starred,
      beforeSlug,
      sceneSlug,
    );
  } catch (err) {
    if (err instanceof CanvasMoveError) throw new MoveSceneError(err.message);
    throw err;
  }

  let nextArrangement: MovieArrangement;
  try {
    nextArrangement = arrangement.moveScene(sceneSlug, toActId, toIndex);
  } catch (err) {
    if (err instanceof MovieArrangementError) {
      throw new MoveSceneError(err.message);
    }
    throw err;
  }

  await deps.saveArrangement(deps.dataDir, nextArrangement);
  const nextProject = await deps.loadProject(deps.dataDir);

  return { project: nextProject, arrangement: nextArrangement };
}
