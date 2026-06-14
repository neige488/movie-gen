/**
 * MovieArrangement — the Scene ordering + Act placement aggregate.
 *
 * Per ADR 0002, Scene order and Act structure are owned by a central manifest
 * (`data/movie.yaml`), NOT by folder-name prefixes. This domain object is the
 * frameworks-free heart of that decision: it holds 3 Acts (ids 1, 2, 3), each
 * an ordered list of Scene slugs, and enforces the structural invariants so an
 * inconsistent arrangement cannot be constructed.
 *
 * Vocabulary anchored to CONTEXT.md / ADR 0002 (Act, Scene manifest).
 *
 * Invariants enforced on construction (and re-checked after every move):
 *  - Exactly acts 1, 2, 3, in that order.
 *  - No duplicate slug (within an act or across acts) — each Scene belongs to
 *    exactly one Act.
 *
 * The "linear movie order = act1 ++ act2 ++ act3 flatten" rule lives here
 * (`linearSequence`). The `isStarred` filter that turns the linear order into
 * the visible movie sequence is applied by the caller (see `movieSequence` in
 * movie.ts) because isStarred is a Scene property, not an arrangement one.
 *
 * Design mirrors movie.ts: a factory validates invariants and returns a
 * readonly object; every mutator (`moveScene`) returns a NEW arrangement and
 * leaves the receiver untouched.
 */

export class MovieArrangementError extends Error {
  public override readonly name = "MovieArrangementError";
}

export type ActId = 1 | 2 | 3;

const ACT_IDS: readonly ActId[] = [1, 2, 3];

export interface ActInput {
  id: ActId;
  scenes: readonly string[];
}

export interface MovieArrangement {
  /** Ordered slugs in the given act. */
  scenesInAct(actId: ActId): readonly string[];
  /** act1 ++ act2 ++ act3, flattened in order. */
  linearSequence(): readonly string[];
  /** The act a slug belongs to, or undefined if it is not placed. */
  actOf(slug: string): ActId | undefined;
  /**
   * Move a Scene to `toActId` at `toIndex` (clamped into range after the slug
   * is removed from its current spot). Returns a NEW arrangement. Rejects an
   * unknown slug or an invalid act id.
   */
  moveScene(slug: string, toActId: ActId, toIndex: number): MovieArrangement;
  /** Plain data view of the acts — used by the adapter to serialize. */
  toActs(): readonly ActInput[];
}

function isValidActId(id: number): id is ActId {
  return id === 1 || id === 2 || id === 3;
}

/**
 * Build a MovieArrangement from per-act slug lists. The acts must be exactly
 * 1, 2, 3 in order. Throws MovieArrangementError on any invariant breach.
 */
export function createMovieArrangement(
  acts: readonly ActInput[],
): MovieArrangement {
  if (acts.length !== 3) {
    throw new MovieArrangementError(
      `arrangement must have exactly 3 acts (got ${acts.length})`,
    );
  }
  for (let i = 0; i < ACT_IDS.length; i++) {
    if (acts[i]!.id !== ACT_IDS[i]) {
      throw new MovieArrangementError(
        `act id at position ${i} must be ${ACT_IDS[i]} (got ${acts[i]!.id})`,
      );
    }
  }

  // No duplicate slug anywhere — each Scene belongs to exactly one Act.
  const seen = new Set<string>();
  for (const act of acts) {
    for (const slug of act.scenes) {
      if (seen.has(slug)) {
        throw new MovieArrangementError(
          `duplicate Scene slug "${slug}" — each Scene must belong to exactly one act`,
        );
      }
      seen.add(slug);
    }
  }

  // Freeze a defensive copy so the returned object is truly immutable.
  const frozen: ActInput[] = acts.map((a) => ({
    id: a.id,
    scenes: [...a.scenes],
  }));

  const indexById = (id: ActId): number => ACT_IDS.indexOf(id);

  return {
    scenesInAct(actId: ActId): readonly string[] {
      if (!isValidActId(actId)) {
        throw new MovieArrangementError(`invalid act id ${actId}`);
      }
      return [...frozen[indexById(actId)]!.scenes];
    },
    linearSequence(): readonly string[] {
      return frozen.flatMap((a) => a.scenes);
    },
    actOf(slug: string): ActId | undefined {
      for (const act of frozen) {
        if (act.scenes.includes(slug)) return act.id;
      }
      return undefined;
    },
    moveScene(slug: string, toActId: ActId, toIndex: number): MovieArrangement {
      if (!isValidActId(toActId)) {
        throw new MovieArrangementError(
          `invalid act id ${toActId} (must be 1, 2, or 3)`,
        );
      }
      // Build the next acts: remove the slug wherever it lives, then insert.
      let found = false;
      const next: ActInput[] = frozen.map((a) => {
        const filtered = a.scenes.filter((s) => {
          if (s === slug) {
            found = true;
            return false;
          }
          return true;
        });
        return { id: a.id, scenes: filtered };
      });
      if (!found) {
        throw new MovieArrangementError(`unknown Scene slug "${slug}"`);
      }
      const target = next[indexById(toActId)]!;
      const clamped = Math.max(0, Math.min(toIndex, target.scenes.length));
      target.scenes.splice(clamped, 0, slug);
      return createMovieArrangement(next);
    },
    toActs(): readonly ActInput[] {
      return frozen.map((a) => ({ id: a.id, scenes: [...a.scenes] }));
    },
  };
}

/**
 * Migration — no manifest on disk yet. Per ADR 0002, drop every existing Scene
 * into act 1 (in the given order) so the Director can redistribute from there.
 */
export function migrateArrangement(
  sceneSlugs: readonly string[],
): MovieArrangement {
  return createMovieArrangement([
    { id: 1, scenes: [...sceneSlugs] },
    { id: 2, scenes: [] },
    { id: 3, scenes: [] },
  ]);
}

/**
 * Reconcile a loaded manifest against the actual Scene folders on disk
 * (per ADR 0002):
 *  - folder present but missing from manifest  → append to the END of act 1
 *  - manifest slug whose folder is gone (dangling) → drop
 *
 * Existing act placement of surviving slugs is preserved. Returns a new
 * arrangement; the input is untouched. `folderSlugs` order only matters for
 * newly-appended scenes (appended in the order they appear).
 */
export function reconcileArrangement(
  manifest: MovieArrangement,
  folderSlugs: readonly string[],
): MovieArrangement {
  const folderSet = new Set(folderSlugs);
  const manifestSet = new Set(manifest.linearSequence());

  // Drop dangling slugs from each act.
  const acts: ActInput[] = manifest.toActs().map((a) => ({
    id: a.id,
    scenes: a.scenes.filter((s) => folderSet.has(s)),
  }));

  // Append orphans (folder present, not in manifest) to the end of act 1, in
  // folder order.
  const orphans = folderSlugs.filter((s) => !manifestSet.has(s));
  acts[0]!.scenes.push(...orphans);

  return createMovieArrangement(acts);
}
