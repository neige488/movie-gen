/**
 * resolveCanvasDropIndex — pure unit tests (BS2 canvas drag, slice #21).
 *
 * Translates a canvas drop ("before this visible slug" / "end of the visible
 * row") into a FULL-manifest insertion index, leaving interleaved non-starred
 * Scenes in their relative slots. No I/O — pure logic.
 */

import { describe, expect, it } from "vitest";
import { resolveCanvasDropIndex, CanvasMoveError } from "./canvas-move.js";

const starred = (...slugs: string[]) => new Set(slugs);

// A dragged slug coming from ANOTHER act (not in the target list) so the
// remove-then-insert shift never applies — keeps these anchor-index assertions
// about the raw resolution only. Same-act shift is covered in its own block.
const FROM_OTHER_ACT = "x-other";

describe("resolveCanvasDropIndex — before a visible anchor", () => {
  it("returns the anchor slug's manifest index (insert ahead of it)", () => {
    const act = ["a", "b", "c"];
    expect(
      resolveCanvasDropIndex(act, starred("a", "b", "c"), "b", FROM_OTHER_ACT),
    ).toBe(1);
    expect(
      resolveCanvasDropIndex(act, starred("a", "b", "c"), "a", FROM_OTHER_ACT),
    ).toBe(0);
  });

  it("counts non-starred slugs that sit before the anchor in the manifest", () => {
    // n1 is non-starred and invisible on the canvas, but it still occupies a
    // manifest slot — the anchor "c" is at manifest index 2, not 1.
    const act = ["a", "n1", "c"];
    expect(
      resolveCanvasDropIndex(act, starred("a", "c"), "c", FROM_OTHER_ACT),
    ).toBe(2);
  });

  it("rejects an anchor that is not in the target act", () => {
    expect(() =>
      resolveCanvasDropIndex(["a", "b"], starred("a", "b"), "ghost", "a"),
    ).toThrow(CanvasMoveError);
  });
});

describe("resolveCanvasDropIndex — end of the visible row (beforeSlug=null)", () => {
  it("lands one past the last starred slug", () => {
    expect(
      resolveCanvasDropIndex(["a", "b"], starred("a", "b"), null, FROM_OTHER_ACT),
    ).toBe(2);
  });

  it("lands after the last starred slug, before trailing non-starred ones", () => {
    // Trailing non-starred n1 keeps its slot AFTER the dropped slug: end of the
    // visible cluster is index 2 (right after starred "b"), not the array end.
    const act = ["a", "b", "n1"];
    expect(
      resolveCanvasDropIndex(act, starred("a", "b"), null, FROM_OTHER_ACT),
    ).toBe(2);
  });

  it("falls to the front (0) of an act with no starred slug to anchor on", () => {
    // Empty act, or an act holding only non-starred Scenes → drop at the front.
    expect(resolveCanvasDropIndex([], starred(), null, FROM_OTHER_ACT)).toBe(0);
    expect(
      resolveCanvasDropIndex(["n1"], starred(), null, FROM_OTHER_ACT),
    ).toBe(0);
  });

  it("skips a leading non-starred slug when anchoring to the row end", () => {
    // n1 leads the act (non-starred); the only starred slug "b" is at index 1,
    // so the visible-row end is index 2.
    const act = ["n1", "b"];
    expect(
      resolveCanvasDropIndex(act, starred("b"), null, FROM_OTHER_ACT),
    ).toBe(2);
  });
});

describe("resolveCanvasDropIndex — same-act move shift compensation", () => {
  // The domain moveScene removes the dragged slug before inserting. When the
  // dragged slug sits in this act BEFORE the resolved insertion point, the
  // index must be decremented so the block lands exactly where it was dropped.

  it("compensates for a FORWARD same-act move (dragged slug before anchor)", () => {
    // [a,b,c,d] drag "a" before "c": raw anchor index 2, but removing "a" first
    // shifts "c" to index 1, so the corrected insertion index is 1 → [b,a,c,d].
    const act = ["a", "b", "c", "d"];
    expect(
      resolveCanvasDropIndex(act, starred("a", "b", "c", "d"), "c", "a"),
    ).toBe(1);
  });

  it("does NOT adjust a BACKWARD same-act move (dragged slug after anchor)", () => {
    // [a,b,c,d] drag "d" before "b": anchor index 1, "d" is after it → no shift.
    const act = ["a", "b", "c", "d"];
    expect(
      resolveCanvasDropIndex(act, starred("a", "b", "c", "d"), "b", "d"),
    ).toBe(1);
  });

  it("compensates for a FORWARD same-act row-end drop", () => {
    // [a,b,c] drag "a" to the row end: raw end index 3, minus 1 for removing
    // "a" → 2 → [b,c,a].
    const act = ["a", "b", "c"];
    expect(
      resolveCanvasDropIndex(act, starred("a", "b", "c"), null, "a"),
    ).toBe(2);
  });
});
