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
