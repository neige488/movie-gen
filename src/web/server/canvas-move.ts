/**
 * Canvas drag → manifest-index resolution (BS2 canvas, slice #21).
 *
 * The canvas shows only *starred* Scenes (dto-mapper filters non-starred out),
 * but `MovieArrangement.moveScene(slug, toActId, toIndex)` indexes into the
 * FULL manifest order of the target act (starred + non-starred). So a canvas
 * drop position — "insert before this visible (starred) slug, or at the end of
 * the visible row" — must be translated into a manifest index that leaves any
 * interleaved non-starred Scenes in their relative slots.
 *
 * This is a pure function (no I/O, no domain mutation) so it is unit-tested in
 * isolation. It also structurally absorbs the deferred edge from review #22:
 * because the drop is expressed relative to a *visible* anchor slug (not a
 * raw numeric index), a non-starred Scene sitting outside the starred head/tail
 * never blocks a drop the way the Scenes-view ▲/▼ disable did.
 *
 * Contract:
 *  - `beforeSlug` = the starred slug the dragged block was dropped *before*.
 *    The result is that slug's manifest index in `targetActSlugs`, so the
 *    dragged slug lands immediately ahead of it.
 *  - `beforeSlug === null` = dropped at the END of the visible (starred) row.
 *    The result is one past the LAST starred slug in the act, so the dragged
 *    slug lands at the tail of the visible cluster — before any trailing
 *    non-starred Scenes keep their slots after it.
 *  - An empty act (no starred slug to anchor on, `beforeSlug === null`) → 0.
 *
 * The anchor index is found against the target act's slug list AS GIVEN (i.e.
 * with the dragged slug still present if it currently lives in this act). But
 * the domain `moveScene` REMOVES the dragged slug before it inserts, which
 * shifts every slot after it down by one. So when the dragged slug currently
 * sits in this act *before* the resolved insertion point (a forward same-act
 * move), the raw index would land the block one slot too late — after the
 * anchor instead of before it. We compensate by decrementing the index in that
 * case, so the block always lands exactly where the director dropped it. A
 * backward move (dragged slug after the anchor) needs no adjustment, and a
 * cross-act move never has the dragged slug in the target list at all.
 */

export class CanvasMoveError extends Error {
  public override readonly name = "CanvasMoveError";
}

/**
 * Resolve the manifest insertion index for a canvas drop.
 *
 * @param targetActSlugs Full manifest order of the destination act (starred +
 *   non-starred), as returned by `arrangement.scenesInAct(toActId)`.
 * @param starredSlugs   Set of slugs that are starred (visible on the canvas).
 * @param beforeSlug     The starred slug to insert before, or null for the end
 *   of the visible row.
 * @param draggedSlug    The slug being moved. When it already lives in this
 *   act before the insertion point, the index is decremented to compensate for
 *   the domain's remove-then-insert (a forward same-act move).
 */
export function resolveCanvasDropIndex(
  targetActSlugs: readonly string[],
  starredSlugs: ReadonlySet<string>,
  beforeSlug: string | null,
  draggedSlug: string,
): number {
  let idx: number;
  if (beforeSlug !== null) {
    idx = targetActSlugs.indexOf(beforeSlug);
    if (idx === -1) {
      throw new CanvasMoveError(
        `drop anchor "${beforeSlug}" is not in the target act`,
      );
    }
  } else {
    // End of the visible row: one past the LAST starred slug in this act. If
    // the act has no starred slug to anchor on, fall to the front of the act.
    let lastStarred = -1;
    for (let i = 0; i < targetActSlugs.length; i++) {
      if (starredSlugs.has(targetActSlugs[i]!)) lastStarred = i;
    }
    idx = lastStarred === -1 ? 0 : lastStarred + 1;
  }

  // Compensate for the domain removing the dragged slug before inserting: if it
  // currently sits in this act ahead of the insertion point, everything after
  // it shifts down by one, so the raw index would overshoot by one.
  const draggedIdx = targetActSlugs.indexOf(draggedSlug);
  if (draggedIdx !== -1 && draggedIdx < idx) idx -= 1;
  return idx;
}
