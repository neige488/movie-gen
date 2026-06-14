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
 * Positioned timeline (point vs span): BS2 beats are of two kinds —
 *  - **span** beats carry a page *range* (`endPage > startPage`) = the dwell
 *    time the audience spends there (설정 1-10, 토론 12-25, 재미와 놀이 30-55,
 *    악당이 다가오다 55-75, 영혼의 어두운 밤 75-85, 피날레 85-110);
 *  - **point** beats are single-page *moments/turns* (`startPage === endPage`):
 *    오프닝, 주제 명시, 기폭제, 2막 진입, B스토리, 중간점, 절망, 3막 진입,
 *    마지막 이미지.
 *
 * Each act row is the act's page range normalized to 0–100% (act 1 = pages
 * [1,25], act 2 = [25,85], act 3 = [85,110] — derived from the beats' page
 * bounds). A beat is *positioned* on that timeline by its page annotation:
 * `leftPct` = start page offset within the act, `widthPct` = page-span length
 * within the act (0 for point beats). So span beats render as proportional bars
 * (real 분량 배분 — "페이지 번호 = 관객이 각 감정에 머무르는 시간의 비율") and
 * point beats render as zero-width markers at their page — instead of forcing
 * single-page moments into a tiling slot they don't deserve. The beats remain a
 * **visual guide only**: a Scene is never pinned to a beat.
 */

export type ActId = 1 | 2 | 3;

/** A span beat owns a page range (dwell time); a point beat is one moment. */
export type BeatKind = "span" | "point";

export interface Beat {
  /** 1..15 in canonical BS2 order. */
  readonly number: number;
  /** Korean label (guide book ch.4). */
  readonly label: string;
  /**
   * One-line beat description (guide book ch.4). Shown in the canvas hover
   * tooltip so narrow beats — whose inline label clips — are still readable.
   */
  readonly description: string;
  /** The act this beat belongs to (1, 2, or 3). */
  readonly act: ActId;
  /** Lower bound of Blake's page annotation (Blake 110p basis). */
  readonly startPage: number;
  /** Upper bound of Blake's page annotation (== startPage for single-page). */
  readonly endPage: number;
  /** "span" (page range = dwell time) or "point" (single-page moment/turn). */
  readonly kind: BeatKind;
  /**
   * The beat's start offset within its act's page timeline, in percent (0–100).
   * Point beats sit at `leftPct`; span beats start there and run `widthPct` wide.
   */
  readonly leftPct: number;
  /**
   * Page-span length within the act, in percent. 0 for point beats. Fixed and
   * non-editable — derived straight from Blake's page annotations.
   */
  readonly widthPct: number;
}

// Raw beat definitions: number, label, act, and the [start, end] page span
// straight from the guide book ch.4 annotations. Single-page beats list the
// same start and end.
interface BeatSeed {
  number: number;
  label: string;
  description: string;
  act: ActId;
  startPage: number;
  endPage: number;
}

const BEAT_SEEDS: readonly BeatSeed[] = [
  // ── Act 1: 오프닝 이미지 ~ 토론 (beats 1–5) ──
  { number: 1, label: "오프닝 이미지", description: "첫인상. 마지막 이미지와 대비.", act: 1, startPage: 1, endPage: 1 },
  { number: 2, label: "주제 명시", description: "영화의 테마를 암시하는 대사/장면.", act: 1, startPage: 5, endPage: 5 },
  { number: 3, label: "설정", description: "주인공의 세계. 뭐가 문제인지.", act: 1, startPage: 1, endPage: 10 },
  { number: 4, label: "기폭제", description: "일상이 깨지는 사건. 되돌릴 수 없음.", act: 1, startPage: 12, endPage: 12 },
  { number: 5, label: "토론", description: "\"이 길을 갈 건가?\" 내적 토론.", act: 1, startPage: 12, endPage: 25 },
  // ── Act 2: 2막 진입 ~ 영혼의 어두운 밤 (beats 6–12) ──
  { number: 6, label: "2막 진입", description: "주인공의 선택. 새로운 세계로.", act: 2, startPage: 25, endPage: 25 },
  { number: 7, label: "B스토리 시작", description: "A스토리와 나란히 달리는 두 번째 이야기(흔히 러브라인)가 들어오는 지점. 영화의 테마를 나르며 2막 내내 A스토리와 함께 진행된다.", act: 2, startPage: 30, endPage: 30 },
  { number: 8, label: "재미와 놀이", description: "콘셉트가 약속한 것을 보여주는 시간.", act: 2, startPage: 30, endPage: 55 },
  { number: 9, label: "중간점", description: "가짜 승리 or 가짜 패배. 전환점.", act: 2, startPage: 55, endPage: 55 },
  { number: 10, label: "악당이 다가오다", description: "모든 것이 조여옴.", act: 2, startPage: 55, endPage: 75 },
  { number: 11, label: "절망의 순간", description: "모든 것을 잃은 것 같은 지점.", act: 2, startPage: 75, endPage: 75 },
  { number: 12, label: "영혼의 어두운 밤", description: "가장 조용하고 가장 아픈 순간.", act: 2, startPage: 75, endPage: 85 },
  // ── Act 3: 3막 진입 ~ 마지막 이미지 (beats 13–15) ──
  { number: 13, label: "3막 진입", description: "절망에서 벗어나 마지막 행동을 결심.", act: 3, startPage: 85, endPage: 85 },
  { number: 14, label: "피날레", description: "해결 또는 결말.", act: 3, startPage: 85, endPage: 110 },
  { number: 15, label: "마지막 이미지", description: "오프닝과 대비. 변화를 보여줌.", act: 3, startPage: 110, endPage: 110 },
];

const ACT_IDS: readonly ActId[] = [1, 2, 3];

/**
 * An act's page bounds = [min startPage, max endPage] over its beats. Act 1
 * resolves to [1,25], act 2 [25,85], act 3 [85,110] — contiguous, matching
 * Blake's act turns (2막 진입 25, 3막 진입 85).
 */
function actPageBounds(act: ActId): { start: number; span: number } {
  const seeds = BEAT_SEEDS.filter((s) => s.act === act);
  const start = Math.min(...seeds.map((s) => s.startPage));
  const end = Math.max(...seeds.map((s) => s.endPage));
  return { start, span: end - start };
}

/**
 * All 15 beats positioned on their act's page timeline, in canonical order.
 * `leftPct`/`widthPct` are percentages within the act (start page → 0, end page
 * → 100). Span beats get a positive width; point beats get width 0 and render
 * as a marker at `leftPct`.
 */
export const ALL_BEATS: readonly Beat[] = (() => {
  const boundsByAct = new Map(
    ACT_IDS.map((act) => [act, actPageBounds(act)] as const),
  );
  return BEAT_SEEDS.map((s) => {
    const { start, span } = boundsByAct.get(s.act)!;
    return {
      number: s.number,
      label: s.label,
      description: s.description,
      act: s.act,
      startPage: s.startPage,
      endPage: s.endPage,
      kind: (s.startPage === s.endPage ? "point" : "span") as BeatKind,
      leftPct: ((s.startPage - start) / span) * 100,
      widthPct: ((s.endPage - s.startPage) / span) * 100,
    };
  });
})();

/** The beats belonging to a given act, in canonical order. */
export function beatsForAct(actId: ActId): readonly Beat[] {
  return ALL_BEATS.filter((b) => b.act === actId);
}

/**
 * An act's page range on Blake's 110p basis (act 1 → [1,25], act 2 → [25,85],
 * act 3 → [85,110]). The canvas scales each act row's width to its page span so
 * the acts' real length differences (act 2 is ~half the movie) are visible.
 */
export function actPageRange(actId: ActId): { start: number; end: number } {
  const { start, span } = actPageBounds(actId);
  return { start, end: start + span };
}

/** The act a beat number belongs to. Throws on an out-of-range beat number. */
export function actOfBeat(beatNumber: number): ActId {
  const beat = ALL_BEATS.find((b) => b.number === beatNumber);
  if (!beat) {
    throw new RangeError(`unknown beat number ${beatNumber} (expected 1..15)`);
  }
  return beat.act;
}
