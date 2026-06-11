/**
 * Tests for `screenplay-segments` — the UI-side splitter that powers the
 * Marker visualization. Mirrors the public-interface style of the rest of
 * the test suite (no internals exposed).
 */

import { describe, expect, it } from "vitest";
import {
  segmentScreenplay,
  missingMarkerShotIds,
} from "./screenplay-segments.js";

describe("segmentScreenplay", () => {
  it("splits a single shot block from surrounding prose", () => {
    const md = [
      "Opening line outside.",
      "",
      "<!-- shot:01 -->",
      "inside body",
      "<!-- /shot:01 -->",
      "",
      "Closing line outside.",
    ].join("\n");
    const seg = segmentScreenplay(md);
    expect(seg.length).toBe(3);
    expect(seg[0]).toEqual({
      kind: "gap",
      text: expect.stringContaining("Opening line"),
    });
    expect(seg[1]).toEqual({
      kind: "shot",
      shotId: "01",
      text: "inside body",
    });
    expect(seg[2]).toEqual({
      kind: "gap",
      text: expect.stringContaining("Closing line"),
    });
  });

  it("emits two shot segments for the same shot id across two blocks", () => {
    const md = [
      "<!-- shot:03 -->",
      "first part",
      "<!-- /shot:03 -->",
      "gap text",
      "<!-- shot:03 -->",
      "second part",
      "<!-- /shot:03 -->",
    ].join("\n");
    const seg = segmentScreenplay(md);
    const shotSegs = seg.filter((s) => s.kind === "shot");
    expect(shotSegs.length).toBe(2);
    expect(shotSegs.every((s) => s.kind === "shot" && s.shotId === "03")).toBe(
      true,
    );
  });

  it("drops pure-whitespace gaps", () => {
    const md = [
      "<!-- shot:01 -->",
      "body",
      "<!-- /shot:01 -->",
      "",
      "<!-- shot:02 -->",
      "body 2",
      "<!-- /shot:02 -->",
    ].join("\n");
    const seg = segmentScreenplay(md);
    expect(seg.every((s) => (s.kind === "gap" ? s.text.trim().length > 0 : true))).toBe(
      true,
    );
  });

  it("returns the whole input as a gap when no markers exist", () => {
    const seg = segmentScreenplay("Just narration. No markers.");
    expect(seg.length).toBe(1);
    expect(seg[0]!.kind).toBe("gap");
  });
});

describe("missingMarkerShotIds", () => {
  it("reports yaml shot ids that have no marker block", () => {
    const md = ["<!-- shot:01 -->", "x", "<!-- /shot:01 -->"].join("\n");
    const seg = segmentScreenplay(md);
    expect(missingMarkerShotIds(seg, ["01", "02", "03"])).toEqual(["02", "03"]);
  });

  it("returns empty when every yaml id is present", () => {
    const md = [
      "<!-- shot:01 -->",
      "x",
      "<!-- /shot:01 -->",
      "<!-- shot:02 -->",
      "y",
      "<!-- /shot:02 -->",
    ].join("\n");
    const seg = segmentScreenplay(md);
    expect(missingMarkerShotIds(seg, ["01", "02"])).toEqual([]);
  });
});
