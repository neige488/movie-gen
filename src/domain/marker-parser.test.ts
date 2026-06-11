import { describe, expect, it } from "vitest";
import {
  parseShotMarkers,
  MarkerParseError,
  validateMarkerConsistency,
  MarkerConsistencyError,
} from "./marker-parser.js";

describe("parseShotMarkers — basic extraction", () => {
  it("extracts a single shot block with its inner text", () => {
    const md = [
      "INT. APARTMENT - NIGHT",
      "",
      "<!-- shot:01 -->",
      "Alice opens the door.",
      "<!-- /shot:01 -->",
      "",
      "Fade out.",
    ].join("\n");

    const blocks = parseShotMarkers(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.shotId).toBe("01");
    expect(blocks[0]!.text.trim()).toBe("Alice opens the door.");
  });

  it("preserves source order across multiple shots", () => {
    const md = [
      "<!-- shot:01 -->",
      "first",
      "<!-- /shot:01 -->",
      "<!-- shot:02 -->",
      "second",
      "<!-- /shot:02 -->",
    ].join("\n");

    const blocks = parseShotMarkers(md);
    expect(blocks.map((b) => b.shotId)).toEqual(["01", "02"]);
  });

  it("returns empty array when no markers present", () => {
    expect(parseShotMarkers("just some prose without markers")).toEqual([]);
  });

  it("allows multiple blocks for the same shot id", () => {
    const md = [
      "<!-- shot:01 -->",
      "part A",
      "<!-- /shot:01 -->",
      "interlude",
      "<!-- shot:01 -->",
      "part B",
      "<!-- /shot:01 -->",
    ].join("\n");

    const blocks = parseShotMarkers(md);
    expect(blocks).toHaveLength(2);
    expect(blocks.every((b) => b.shotId === "01")).toBe(true);
    expect(blocks[0]!.text.trim()).toBe("part A");
    expect(blocks[1]!.text.trim()).toBe("part B");
  });

  it("tolerates extra whitespace inside marker comments", () => {
    const md = "<!--   shot:03   -->\nbody\n<!--   /shot:03   -->";
    const blocks = parseShotMarkers(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.shotId).toBe("03");
  });
});

describe("parseShotMarkers — validation errors", () => {
  it("rejects nested shot markers", () => {
    const md = [
      "<!-- shot:01 -->",
      "outer",
      "<!-- shot:02 -->",
      "inner",
      "<!-- /shot:02 -->",
      "<!-- /shot:01 -->",
    ].join("\n");

    expect(() => parseShotMarkers(md)).toThrow(MarkerParseError);
    expect(() => parseShotMarkers(md)).toThrow(/nested/i);
  });

  it("rejects unclosed shot markers", () => {
    const md = "<!-- shot:01 -->\nbody without close";
    expect(() => parseShotMarkers(md)).toThrow(MarkerParseError);
    expect(() => parseShotMarkers(md)).toThrow(/unclosed/i);
  });

  it("rejects close without matching open", () => {
    const md = "body\n<!-- /shot:01 -->";
    expect(() => parseShotMarkers(md)).toThrow(MarkerParseError);
    expect(() => parseShotMarkers(md)).toThrow(/unmatched|no open/i);
  });

  it("rejects mismatched close id", () => {
    const md = "<!-- shot:01 -->\nbody\n<!-- /shot:02 -->";
    expect(() => parseShotMarkers(md)).toThrow(MarkerParseError);
    expect(() => parseShotMarkers(md)).toThrow(/mismatch/i);
  });

  it("error includes the line number of the offending marker", () => {
    const md = ["line1", "line2", "<!-- shot:01 -->", "no close"].join("\n");
    try {
      parseShotMarkers(md);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(MarkerParseError);
      expect((err as MarkerParseError).line).toBe(3);
    }
  });
});

describe("parseShotMarkers — shot id format", () => {
  it("accepts numeric ids of any length", () => {
    const md = "<!-- shot:001 -->\nx\n<!-- /shot:001 -->";
    expect(parseShotMarkers(md)[0]!.shotId).toBe("001");
  });

  it("rejects non-numeric ids", () => {
    const md = "<!-- shot:abc -->\nx\n<!-- /shot:abc -->";
    expect(() => parseShotMarkers(md)).toThrow(MarkerParseError);
  });
});

// ---------------------------------------------------------------------------
// validateMarkerConsistency — guards Light edit (Slice 5) screenplay writes.
//
// Per Slice 5 PRD: HTML comment marker must be preserved when the director
// edits screenplay.md from the web. Adding new Shots is out of scope (Claude
// Code recommended), so this validator is strict: the set of shotIds in the
// new markdown must equal the expected set exactly. Mismatched (missing,
// extra, duplicate) are all rejected with a clear message.
// ---------------------------------------------------------------------------

describe("validateMarkerConsistency — strict shotId set match", () => {
  it("passes when markdown markers match the expected shot ids exactly", () => {
    const md = [
      "<!-- shot:01 -->",
      "A",
      "<!-- /shot:01 -->",
      "<!-- shot:02 -->",
      "B",
      "<!-- /shot:02 -->",
    ].join("\n");
    expect(() =>
      validateMarkerConsistency(md, ["01", "02"]),
    ).not.toThrow();
  });

  it("passes when expected ids are empty and markdown has no markers", () => {
    expect(() => validateMarkerConsistency("plain text", [])).not.toThrow();
  });

  it("passes regardless of expected id ordering", () => {
    const md = [
      "<!-- shot:02 -->",
      "B",
      "<!-- /shot:02 -->",
      "<!-- shot:01 -->",
      "A",
      "<!-- /shot:01 -->",
    ].join("\n");
    expect(() =>
      validateMarkerConsistency(md, ["01", "02"]),
    ).not.toThrow();
  });

  it("allows the same shot id to appear in multiple disjoint blocks", () => {
    const md = [
      "<!-- shot:01 -->",
      "part A",
      "<!-- /shot:01 -->",
      "interlude",
      "<!-- shot:01 -->",
      "part B",
      "<!-- /shot:01 -->",
    ].join("\n");
    expect(() => validateMarkerConsistency(md, ["01"])).not.toThrow();
  });

  it("rejects when a shot marker is missing from the markdown", () => {
    const md = "<!-- shot:01 -->\nA\n<!-- /shot:01 -->";
    expect(() =>
      validateMarkerConsistency(md, ["01", "02"]),
    ).toThrow(MarkerConsistencyError);
    expect(() =>
      validateMarkerConsistency(md, ["01", "02"]),
    ).toThrow(/missing.*02/i);
  });

  it("rejects when the markdown introduces an unknown shot id", () => {
    const md = [
      "<!-- shot:01 -->",
      "A",
      "<!-- /shot:01 -->",
      "<!-- shot:99 -->",
      "new",
      "<!-- /shot:99 -->",
    ].join("\n");
    expect(() =>
      validateMarkerConsistency(md, ["01"]),
    ).toThrow(MarkerConsistencyError);
    expect(() =>
      validateMarkerConsistency(md, ["01"]),
    ).toThrow(/unexpected.*99/i);
  });

  it("rejects when the markdown drops all markers but Shots exist", () => {
    expect(() =>
      validateMarkerConsistency("clean prose, no markers", ["01"]),
    ).toThrow(MarkerConsistencyError);
  });

  it("surfaces structural parse errors (e.g. unclosed) as MarkerConsistencyError", () => {
    // Light-edit users see a single category of error; we wrap the parse
    // failure so the HTTP layer can map 4xx with a uniform shape.
    const md = "<!-- shot:01 -->\nunclosed";
    expect(() =>
      validateMarkerConsistency(md, ["01"]),
    ).toThrow(MarkerConsistencyError);
  });
});
