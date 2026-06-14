/**
 * BeatSheet — the fixed BS2 (Blake Snyder Beat Sheet) definition.
 *
 * Per CONTEXT.md ("Beat") and the guide book (ch.4), BS2 has 15 structural
 * beats. The canvas lays each act's beats out as a *proportional visual ruler*
 * whose widths come from Blake's 110-page annotations — the bigger a beat's
 * page span, the wider its tick. The beats are a **visual guide only**: a Scene
 * is never pinned to a beat (no `beat` field on Scene). This module is pure
 * data + pure calculation — frameworks-free, the heart of the canvas's ruler.
 *
 * Vocabulary anchored to CONTEXT.md / docs/specs/bs2-canvas.md.
 *
 * Act grouping (CONTEXT.md): act 1 = beats 1–5, act 2 = beats 6–12 (2막 진입 ~
 * 영혼의 어두운 밤), act 3 = beats 13–15 (3막 진입 ~ 마지막 이미지).
 *
 * Width derivation (see docs/specs/bs2-canvas.md + PR In-flight decisions):
 * each beat carries the page span from its Blake annotation
 * (`[startPage, endPage]`; single-page beats have start === end). A beat's raw
 * "weight" is its page span length, floored at `MIN_SPAN` so the single-page
 * punctuation beats (오프닝, 기폭제, 중간점, 절망 …) still render as a visible
 * tick rather than collapsing to zero width. Each act's weights are then
 * normalized to percentages summing to 100. This reads the annotations
 * directly (no invented anchors) and naturally makes "재미와 놀이" the widest
 * act-2 beat and "피날레" dominate act 3 — matching the guide's stated 분량
 * 배분 purpose ("페이지 번호 = 관객이 각 감정에 머무르는 시간의 비율").
 */

export type ActId = 1 | 2 | 3;

export interface Beat {
  /** 1..15 in canonical BS2 order. */
  readonly number: number;
  /** Korean label (guide book ch.4). */
  readonly label: string;
  /** The act this beat belongs to (1, 2, or 3). */
  readonly act: ActId;
  /** Lower bound of Blake's page annotation (Blake 110p basis). */
  readonly startPage: number;
  /** Upper bound of Blake's page annotation (== startPage for single-page). */
  readonly endPage: number;
  /**
   * This beat's share of its act, in percent. Per-act widths sum to 100.
   * Derived from the page span (floored at MIN_SPAN), normalized within the
   * act. Fixed and non-editable.
   */
  readonly widthPct: number;
}

/**
 * Floor for a beat's page weight. Single-page "punctuation" beats (span 0)
 * would otherwise be invisible; one page-equivalent keeps them as a thin tick.
 */
const MIN_SPAN = 1;

// Raw beat definitions: number, label, act, and the [start, end] page span
// straight from the guide book ch.4 annotations. Single-page beats list the
// same start and end.
interface BeatSeed {
  number: number;
  label: string;
  act: ActId;
  startPage: number;
  endPage: number;
}

const BEAT_SEEDS: readonly BeatSeed[] = [
  // ── Act 1: 오프닝 이미지 ~ 토론 (beats 1–5) ──
  { number: 1, label: "오프닝 이미지", act: 1, startPage: 1, endPage: 1 },
  { number: 2, label: "주제 명시", act: 1, startPage: 5, endPage: 5 },
  { number: 3, label: "설정", act: 1, startPage: 1, endPage: 10 },
  { number: 4, label: "기폭제", act: 1, startPage: 12, endPage: 12 },
  { number: 5, label: "토론", act: 1, startPage: 12, endPage: 25 },
  // ── Act 2: 2막 진입 ~ 영혼의 어두운 밤 (beats 6–12) ──
  { number: 6, label: "2막 진입", act: 2, startPage: 25, endPage: 25 },
  { number: 7, label: "B스토리", act: 2, startPage: 30, endPage: 30 },
  { number: 8, label: "재미와 놀이", act: 2, startPage: 30, endPage: 55 },
  { number: 9, label: "중간점", act: 2, startPage: 55, endPage: 55 },
  { number: 10, label: "악당이 다가오다", act: 2, startPage: 55, endPage: 75 },
  { number: 11, label: "절망의 순간", act: 2, startPage: 75, endPage: 75 },
  { number: 12, label: "영혼의 어두운 밤", act: 2, startPage: 75, endPage: 85 },
  // ── Act 3: 3막 진입 ~ 마지막 이미지 (beats 13–15) ──
  { number: 13, label: "3막 진입", act: 3, startPage: 85, endPage: 85 },
  { number: 14, label: "피날레", act: 3, startPage: 85, endPage: 110 },
  { number: 15, label: "마지막 이미지", act: 3, startPage: 110, endPage: 110 },
];

const ACT_IDS: readonly ActId[] = [1, 2, 3];

function weightOf(seed: BeatSeed): number {
  return Math.max(seed.endPage - seed.startPage, MIN_SPAN);
}

/**
 * All 15 beats with computed `widthPct`, in canonical order. The percentages
 * are normalized per act (each act sums to 100), so the canvas can lay each
 * act row's ruler out independently.
 */
export const ALL_BEATS: readonly Beat[] = (() => {
  // Per-act total weight for normalization.
  const actTotals = new Map<ActId, number>();
  for (const act of ACT_IDS) {
    const total = BEAT_SEEDS.filter((s) => s.act === act).reduce(
      (acc, s) => acc + weightOf(s),
      0,
    );
    actTotals.set(act, total);
  }
  return BEAT_SEEDS.map((s) => ({
    number: s.number,
    label: s.label,
    act: s.act,
    startPage: s.startPage,
    endPage: s.endPage,
    widthPct: (weightOf(s) / actTotals.get(s.act)!) * 100,
  }));
})();

/** The beats belonging to a given act, in canonical order. */
export function beatsForAct(actId: ActId): readonly Beat[] {
  return ALL_BEATS.filter((b) => b.act === actId);
}

/** The act a beat number belongs to. Throws on an out-of-range beat number. */
export function actOfBeat(beatNumber: number): ActId {
  const beat = ALL_BEATS.find((b) => b.number === beatNumber);
  if (!beat) {
    throw new RangeError(`unknown beat number ${beatNumber} (expected 1..15)`);
  }
  return beat.act;
}
