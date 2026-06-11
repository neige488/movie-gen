/**
 * SyncEvaluator — compare a Scene's current screenplay marker block hashes
 * against the screenplayHash snapshots stored on each Shot and Take.
 *
 * Per CONTEXT.md:
 * - Sync state is a SIGNAL, never an auto-decision.
 * - Take is immutable; the tool never modifies it.
 *
 * Status semantics (per Shot):
 * - `current`     — Shot.screenplayHash matches current block AND every Take
 *                   also matches.
 * - `shot-stale`  — Shot.screenplayHash differs from current block hash.
 * - `take-stale`  — Shot is current but at least one Take is on an older hash.
 * - `orphan`      — No marker block in screenplay matches this Shot.id.
 */

import { computeScreenplayHash } from "./hash-calculator.js";
import { parseShotMarkers } from "./marker-parser.js";
import type { Scene } from "./movie.js";

export type SyncStatus = "current" | "shot-stale" | "take-stale" | "orphan";

/**
 * Per-Take status — narrower than `SyncStatus` because a Take cannot
 * distinguish "shot-stale" from "take-stale" (it knows only its own hash).
 *
 * Semantics:
 * - `current` — Take.screenplayHash equals the canonical hash for the Shot.
 * - `stale`   — Take.screenplayHash differs from the canonical hash.
 * - `orphan`  — The Shot has no matching marker block in the screenplay, so
 *               there is no canonical hash to compare against. The UI
 *               typically surfaces the orphan signal at the Shot level and
 *               leaves the Take card neutral — but the status is here so the
 *               server can emit it explicitly rather than inventing a default.
 */
export type TakeSyncStatus = "current" | "stale" | "orphan";

export interface ShotSyncStatus {
  readonly shotId: string;
  readonly status: SyncStatus;
}

export function evaluateSceneSync(scene: Scene): readonly ShotSyncStatus[] {
  const blocks = parseShotMarkers(scene.screenplay);

  // Group block texts by shot id; if multiple blocks for the same id, the
  // canonical hash is over the concatenation of normalized block texts joined
  // by a blank line. The single-block case degenerates trivially.
  const textsByShot = new Map<string, string[]>();
  for (const block of blocks) {
    const arr = textsByShot.get(block.shotId) ?? [];
    arr.push(block.text);
    textsByShot.set(block.shotId, arr);
  }
  const hashByShot = new Map<string, string>();
  for (const [shotId, texts] of textsByShot) {
    hashByShot.set(shotId, computeScreenplayHash(texts.join("\n\n")));
  }

  return scene.shots.map<ShotSyncStatus>((shot) => {
    const currentHash = hashByShot.get(shot.id);
    if (currentHash === undefined) {
      return { shotId: shot.id, status: "orphan" };
    }
    if (shot.screenplayHash !== currentHash) {
      return { shotId: shot.id, status: "shot-stale" };
    }
    const anyTakeStale = shot.takes.some(
      (t) => t.screenplayHash !== currentHash,
    );
    return {
      shotId: shot.id,
      status: anyTakeStale ? "take-stale" : "current",
    };
  });
}

/**
 * Resolve the canonical marker-block hash for a Shot id within a Scene, or
 * `undefined` if the Shot has no marker block (orphan). Same model as
 * `evaluateSceneSync`: if multiple blocks share the same Shot id, hash is
 * over the concatenated normalized text joined by a blank line.
 */
function currentHashForShot(scene: Scene, shotId: string): string | undefined {
  const blocks = parseShotMarkers(scene.screenplay).filter(
    (b) => b.shotId === shotId,
  );
  if (blocks.length === 0) return undefined;
  return computeScreenplayHash(blocks.map((b) => b.text).join("\n\n"));
}

/**
 * Compute the sync status of a single Take. Used by the wire-DTO mapper so
 * the client can render a per-Take "구버전 각본 기반" badge without
 * receiving the whole `evaluateSceneSync` result.
 *
 * Returns `"orphan"` if the parent Shot has no matching marker block;
 * `"current"` if the Take's hash matches the canonical block hash; else
 * `"stale"`. Returns `"orphan"` (rather than throwing) for an unknown shot/
 * take id — callers map domain objects they themselves constructed so an
 * unknown id is a programming error, but defaulting to orphan keeps the
 * UI safe rather than crashing the server response.
 */
export function evaluateTakeSync(
  scene: Scene,
  shotId: string,
  takeId: string,
): TakeSyncStatus {
  const shot = scene.shots.find((s) => s.id === shotId);
  if (!shot) return "orphan";
  const take = shot.takes.find((t) => t.id === takeId);
  if (!take) return "orphan";
  const currentHash = currentHashForShot(scene, shotId);
  if (currentHash === undefined) return "orphan";
  return take.screenplayHash === currentHash ? "current" : "stale";
}
