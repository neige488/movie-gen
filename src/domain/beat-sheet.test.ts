import { describe, expect, it } from "vitest";
import { ALL_BEATS, actOfBeat, beatsForAct } from "./beat-sheet.js";

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

  it("gives every beat a non-empty description (guide book ch.4)", () => {
    for (const beat of ALL_BEATS) {
      expect(beat.description.trim().length).toBeGreaterThan(0);
    }
  });

  it("carries the guide book description for known beats", () => {
    const byLabel = new Map(ALL_BEATS.map((b) => [b.label, b.description]));
    expect(byLabel.get("오프닝 이미지")).toBe("첫인상. 마지막 이미지와 대비.");
    expect(byLabel.get("기폭제")).toBe("일상이 깨지는 사건. 되돌릴 수 없음.");
    expect(byLabel.get("마지막 이미지")).toBe("오프닝과 대비. 변화를 보여줌.");
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

describe("BeatSheet — point vs span classification", () => {
  it("marks page-range beats as span, single-page beats as point", () => {
    const byLabel = new Map(ALL_BEATS.map((b) => [b.label, b.kind]));
    // spans (page ranges = dwell time)
    for (const label of [
      "설정",
      "토론",
      "재미와 놀이",
      "악당이 다가오다",
      "영혼의 어두운 밤",
      "피날레",
    ]) {
      expect(byLabel.get(label)).toBe("span");
    }
    // points (single-page moments/turns)
    for (const label of [
      "오프닝 이미지",
      "주제 명시",
      "기폭제",
      "2막 진입",
      "B스토리",
      "중간점",
      "절망의 순간",
      "3막 진입",
      "마지막 이미지",
    ]) {
      expect(byLabel.get(label)).toBe("point");
    }
  });

  it("gives point beats zero width and span beats positive width", () => {
    for (const beat of ALL_BEATS) {
      if (beat.kind === "point") {
        expect(beat.widthPct).toBe(0);
        expect(beat.startPage).toBe(beat.endPage);
      } else {
        expect(beat.widthPct).toBeGreaterThan(0);
      }
    }
  });
});

describe("BeatSheet — positioned timeline (act page range → 0–100%)", () => {
  it("keeps every beat inside its act timeline (0 ≤ left, left+width ≤ 100)", () => {
    for (const beat of ALL_BEATS) {
      expect(beat.leftPct).toBeGreaterThanOrEqual(0);
      expect(beat.leftPct + beat.widthPct).toBeLessThanOrEqual(100 + 1e-9);
    }
  });

  it("positions act-1 beats on the [1,25] page timeline", () => {
    const byLabel = new Map(beatsForAct(1).map((b) => [b.label, b]));
    // 설정 1-10 → left 0, width 9/24
    expect(byLabel.get("설정")!.leftPct).toBeCloseTo(0, 6);
    expect(byLabel.get("설정")!.widthPct).toBeCloseTo(37.5, 6);
    // 토론 12-25 → left 11/24, width 13/24
    expect(byLabel.get("토론")!.leftPct).toBeCloseTo((11 / 24) * 100, 6);
    expect(byLabel.get("토론")!.widthPct).toBeCloseTo((13 / 24) * 100, 6);
    // 주제 명시 (point, p.5) → left 4/24, width 0
    expect(byLabel.get("주제 명시")!.leftPct).toBeCloseTo((4 / 24) * 100, 6);
    expect(byLabel.get("주제 명시")!.widthPct).toBe(0);
  });

  it("spans act 3 entirely with 피날레, pinning 마지막 이미지 at the right edge", () => {
    const byLabel = new Map(beatsForAct(3).map((b) => [b.label, b]));
    expect(byLabel.get("3막 진입")!.leftPct).toBeCloseTo(0, 6);
    expect(byLabel.get("피날레")!.leftPct).toBeCloseTo(0, 6);
    expect(byLabel.get("피날레")!.widthPct).toBeCloseTo(100, 6);
    expect(byLabel.get("마지막 이미지")!.leftPct).toBeCloseTo(100, 6);
    expect(byLabel.get("마지막 이미지")!.widthPct).toBe(0);
  });

  it("exposes the page span each position was derived from (transparency)", () => {
    const opening = ALL_BEATS[0]!;
    expect(opening.startPage).toBe(1);
    expect(opening.endPage).toBe(1);
    const fun = ALL_BEATS.find((b) => b.label === "재미와 놀이")!;
    expect(fun.startPage).toBe(30);
    expect(fun.endPage).toBe(55);
  });
});
