import { describe, expect, it } from "vitest";
import {
  ALL_BEATS,
  actOfBeat,
  beatsForAct,
  type ActId,
} from "./beat-sheet.js";

// ---------------------------------------------------------------------------
// The BeatSheet is the fixed BS2 (Blake Snyder Beat Sheet) definition: 15
// beats, Korean labels, act grouping, and per-act ratio widths derived from
// Blake's 110-page annotations (guide book ch.4). It is pure data + pure
// calculation — no I/O, no framework. Beats are a visual ruler only; Scenes
// are never "pinned" to a beat.
// ---------------------------------------------------------------------------

describe("BeatSheet — the 15 fixed beats", () => {
  it("has exactly 15 beats in canonical order with Korean labels", () => {
    expect(ALL_BEATS).toHaveLength(15);
    expect(ALL_BEATS.map((b) => b.label)).toEqual([
      "오프닝 이미지",
      "주제 명시",
      "설정",
      "기폭제",
      "토론",
      "2막 진입",
      "B스토리",
      "재미와 놀이",
      "중간점",
      "악당이 다가오다",
      "절망의 순간",
      "영혼의 어두운 밤",
      "3막 진입",
      "피날레",
      "마지막 이미지",
    ]);
  });

  it("numbers beats 1..15 in order", () => {
    expect(ALL_BEATS.map((b) => b.number)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]);
  });
});

describe("BeatSheet — act grouping", () => {
  it("groups beats 1-5 into act 1", () => {
    expect(beatsForAct(1).map((b) => b.number)).toEqual([1, 2, 3, 4, 5]);
  });

  it("groups beats 6-12 into act 2 (2막 진입 ~ 영혼의 어두운 밤)", () => {
    expect(beatsForAct(2).map((b) => b.number)).toEqual([6, 7, 8, 9, 10, 11, 12]);
  });

  it("groups beats 13-15 into act 3 (3막 진입 ~ 마지막 이미지)", () => {
    expect(beatsForAct(3).map((b) => b.number)).toEqual([13, 14, 15]);
  });

  it("every beat reports the act it belongs to", () => {
    expect(actOfBeat(1)).toBe(1);
    expect(actOfBeat(5)).toBe(1);
    expect(actOfBeat(6)).toBe(2);
    expect(actOfBeat(12)).toBe(2);
    expect(actOfBeat(13)).toBe(3);
    expect(actOfBeat(15)).toBe(3);
  });
});

describe("BeatSheet — ratio widths (Blake page spans → per-act share)", () => {
  function sum(act: ActId): number {
    return beatsForAct(act).reduce((acc, b) => acc + b.widthPct, 0);
  }

  it("each act's widths sum to 100%", () => {
    for (const act of [1, 2, 3] as const) {
      expect(sum(act)).toBeCloseTo(100, 6);
    }
  });

  it("gives every beat a positive width (single-page beats stay visible)", () => {
    for (const beat of ALL_BEATS) {
      expect(beat.widthPct).toBeGreaterThan(0);
    }
  });

  it("makes the widest beat per act the longest page span", () => {
    // Act 1: 토론 (12-25) is the longest span.
    const act1Widest = [...beatsForAct(1)].sort(
      (a, b) => b.widthPct - a.widthPct,
    )[0];
    expect(act1Widest?.label).toBe("토론");
    // Act 2: 재미와 놀이 (30-55) is the longest span.
    const act2Widest = [...beatsForAct(2)].sort(
      (a, b) => b.widthPct - a.widthPct,
    )[0];
    expect(act2Widest?.label).toBe("재미와 놀이");
    // Act 3: 피날레 (85-110) dominates.
    const act3Widest = [...beatsForAct(3)].sort(
      (a, b) => b.widthPct - a.widthPct,
    )[0];
    expect(act3Widest?.label).toBe("피날레");
  });

  it("derives widths deterministically (Act 1 known values)", () => {
    // Act 1 spans (min 1 page for single-page beats): 1,1,9,1,13 = 25 total.
    const byLabel = new Map(beatsForAct(1).map((b) => [b.label, b.widthPct]));
    expect(byLabel.get("오프닝 이미지")).toBeCloseTo(4, 6);
    expect(byLabel.get("주제 명시")).toBeCloseTo(4, 6);
    expect(byLabel.get("설정")).toBeCloseTo(36, 6);
    expect(byLabel.get("기폭제")).toBeCloseTo(4, 6);
    expect(byLabel.get("토론")).toBeCloseTo(52, 6);
  });

  it("exposes the page span each width was derived from (transparency)", () => {
    const opening = ALL_BEATS[0]!;
    expect(opening.startPage).toBe(1);
    expect(opening.endPage).toBe(1);
    const fun = ALL_BEATS.find((b) => b.label === "재미와 놀이")!;
    expect(fun.startPage).toBe(30);
    expect(fun.endPage).toBe(55);
  });
});
