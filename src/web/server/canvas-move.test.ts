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

describe("resolveCanvasDropIndex — before a visible anchor", () => {
  it("returns the anchor slug's manifest index (insert ahead of it)", () => {
    const act = ["a", "b", "c"];
    expect(resolveCanvasDropIndex(act, starred("a", "b", "c"), "b")).toBe(1);
    expect(resolveCanvasDropIndex(act, starred("a", "b", "c"), "a")).toBe(0);
  });

  it("counts non-starred slugs that sit before the anchor in the manifest", () => {
    // n1 is non-starred and invisible on the canvas, but it still occupies a
    // manifest slot — the anchor "c" is at manifest index 2, not 1.
    const act = ["a", "n1", "c"];
    expect(resolveCanvasDropIndex(act, starred("a", "c"), "c")).toBe(2);
  });

  it("rejects an anchor that is not in the target act", () => {
    expect(() =>
      resolveCanvasDropIndex(["a", "b"], starred("a", "b"), "ghost"),
    ).toThrow(CanvasMoveError);
  });
});

describe("resolveCanvasDropIndex — end of the visible row (beforeSlug=null)", () => {
  it("lands one past the last starred slug", () => {
    expect(resolveCanvasDropIndex(["a", "b"], starred("a", "b"), null)).toBe(2);
  });

  it("lands after the last starred slug, before trailing non-starred ones", () => {
    // Trailing non-starred n1 keeps its slot AFTER the dropped slug: end of the
    // visible cluster is index 2 (right after starred "b"), not the array end.
    const act = ["a", "b", "n1"];
    expect(resolveCanvasDropIndex(act, starred("a", "b"), null)).toBe(2);
  });

  it("falls to the front (0) of an act with no starred slug to anchor on", () => {
    // Empty act, or an act holding only non-starred Scenes → drop at the front.
    expect(resolveCanvasDropIndex([], starred(), null)).toBe(0);
    expect(resolveCanvasDropIndex(["n1"], starred(), null)).toBe(0);
  });

  it("skips a leading non-starred slug when anchoring to the row end", () => {
    // n1 leads the act (non-starred); the only starred slug "b" is at index 1,
    // so the visible-row end is index 2.
    const act = ["n1", "b"];
    expect(resolveCanvasDropIndex(act, starred("b"), null)).toBe(2);
  });
});
