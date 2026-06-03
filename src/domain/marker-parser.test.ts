import { describe, expect, it } from "vitest";
import { parseShotMarkers, MarkerParseError } from "./marker-parser.js";

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
