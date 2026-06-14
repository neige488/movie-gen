import { useState } from "react";
import type { BeatDto, CanvasActDto, MovieDto } from "../../shared/dto.js";
import { moveSceneToAct } from "../upload-client.js";

/**
 * BS2 Canvas — draggable (slice #21, built on #20's read view).
 *
 * Renders the movie's starred Scenes across the 3 BS2 act rows. Each row shows:
 *  - a *beat ruler*: the act's BS2 beats positioned on the act's page timeline
 *    (server-computed in BeatSheet, shipped in `CanvasActDto.beats`). Span beats
 *    (page ranges) are proportional bars; point beats (single-page moments) are
 *    zero-width markers. Hover shows the full name + description. Visual guide
 *    only — a Scene is never pinned to a beat.
 *  - the act's starred Scenes as **equal-width** blocks (length ignored, per
 *    PRD) in manifest order.
 *
 * Drag (slice #21): the director can drag a Scene block (a) within an act row
 * to reorder it or (b) onto another act row to re-place it. A drop is expressed
 * as a *visible anchor* — drop BEFORE a starred block, or at the END of an act
 * row — which the server (`/api/scenes/:slug/move`) resolves to a manifest
 * index. Because the drop position is chosen directly, the canvas structurally
 * sidesteps the Scenes-view ▲/▼ "screen-adjacent disable" edge (review #22):
 * there is no end-of-row button to disable, the director just drops where they
 * want. The server is the SSOT (no optimistic UI) — `onMovieChanged` swaps in
 * the server's reply.
 *
 * First-run is fine: after migration every Scene sits in act 1, so the canvas
 * shows them all clustered in the act-1 row (per AC), then the director drags
 * them out into acts 2/3.
 *
 * Uses native HTML5 drag-and-drop (no library) — minimal stack, behavior over
 * polish (animations/snapping are out of scope per the issue).
 */

const ACT_TITLES: Record<1 | 2 | 3, string> = {
  1: "1막",
  2: "2막",
  3: "3막",
};

/** Human page-range label for a beat: "p.12" (point) or "p.12-25" (span). */
function pageLabel(beat: BeatDto): string {
  return beat.startPage === beat.endPage
    ? `p.${beat.startPage}`
    : `p.${beat.startPage}-${beat.endPage}`;
}

/** Edge-aware horizontal transform for a point's name (keeps edge labels in view). */
function pointNameTransform(leftPct: number): string {
  if (leftPct <= 10) return "translateX(0)";
  if (leftPct >= 90) return "translateX(-100%)";
  return "translateX(-50%)";
}

/** Currently-hovered beat + viewport anchor (for the fixed tooltip). */
interface BeatTip {
  beat: BeatDto;
  x: number;
  y: number;
}

/** What the director is currently dragging. */
interface DragState {
  slug: string;
}

interface Props {
  movie: MovieDto;
  /**
   * Called with the updated MovieDto after a successful drag-move so the App
   * can refresh the canvas + sequence. When omitted the canvas is read-only
   * (drag is disabled) — e.g. if a parent has no movie state setter.
   */
  onMovieChanged?: (movie: MovieDto) => void;
  /**
   * Called when a Scene block is clicked. The parent shows the Scene's detail
   * (the same SceneView used in the Scenes tab) below the canvas. When omitted,
   * the block falls back to its `#scene-<slug>` jump link.
   */
  onSelectScene?: (slug: string) => void;
  /** Currently-selected Scene slug (highlights its block). */
  selectedSlug?: string | null;
}

export function BS2Canvas({
  movie,
  onMovieChanged,
  onSelectScene,
  selectedSlug,
}: Props) {
  const acts = movie.acts;
  // Slug being dragged (null = idle). Also gates overlapping moves.
  const [drag, setDrag] = useState<DragState | null>(null);
  // True while a move request is in flight — disables further drags.
  const [busy, setBusy] = useState(false);

  if (!acts || acts.length === 0) {
    return (
      <div className="status">
        캔버스 데이터를 불러올 수 없습니다 (매니페스트 미연결).
      </div>
    );
  }

  const canDrag = onMovieChanged !== undefined;

  // slug → slugline lookup so blocks can show a human-readable label.
  const sluglineBySlug = new Map(
    movie.allScenes.map((s) => [s.slug, s.slugline]),
  );

  const totalStarred = acts.reduce((acc, a) => acc + a.sceneSlugs.length, 0);

  // The longest act fills the full width; shorter acts scale relative to it
  // (max-normalized), so the length differences show without wasting space.
  // (The label still shows each act's share of the whole movie — pagePct.)
  const maxSpan = Math.max(1, ...acts.map((a) => a.pageEnd - a.pageStart));

  async function commitMove(
    slug: string,
    toActId: 1 | 2 | 3,
    beforeSlug: string | null,
  ): Promise<void> {
    if (!onMovieChanged || busy) return;
    // No-op drop onto itself (drop before the same block).
    if (beforeSlug === slug) return;
    setBusy(true);
    try {
      const next = await moveSceneToAct(slug, toActId, beforeSlug);
      onMovieChanged(next);
    } catch (err) {
      // The server rejected (e.g. unknown scene / invalid anchor). The canvas
      // on screen is still the last-known-good arrangement, so a console
      // warning is enough for this lightweight control.
      console.warn("[canvas move]", (err as Error).message);
    } finally {
      setBusy(false);
      setDrag(null);
    }
  }

  return (
    <div className="canvas">
      <header className="canvas__header">
        <h2 className="canvas__title">BS2 캔버스</h2>
        <p className="canvas__subtitle">
          starred Scene {totalStarred}개가 1/2/3막에 어떻게 분포하는지, 각 막의
          비트 가이드 위 어디쯤에 떨어지는지 봅니다.
          {canDrag
            ? " Scene을 드래그해 막 안에서 순서를 바꾸거나 다른 막으로 옮기세요."
            : " 읽기 전용입니다."}
        </p>
      </header>
      {acts.map((act) => (
        <ActRow
          key={act.id}
          act={act}
          maxSpan={maxSpan}
          sluglineBySlug={sluglineBySlug}
          canDrag={canDrag}
          onSelectScene={onSelectScene}
          selectedSlug={selectedSlug}
          drag={drag}
          onDragStart={(slug) => setDrag({ slug })}
          onDragEnd={() => setDrag(null)}
          onDropBefore={(beforeSlug) => {
            if (drag) void commitMove(drag.slug, act.id, beforeSlug);
          }}
          onDropAtEnd={() => {
            if (drag) void commitMove(drag.slug, act.id, null);
          }}
        />
      ))}
    </div>
  );
}

function ActRow({
  act,
  maxSpan,
  sluglineBySlug,
  canDrag,
  onSelectScene,
  selectedSlug,
  drag,
  onDragStart,
  onDragEnd,
  onDropBefore,
  onDropAtEnd,
}: {
  act: CanvasActDto;
  maxSpan: number;
  sluglineBySlug: Map<string, string>;
  canDrag: boolean;
  onSelectScene?: (slug: string) => void;
  selectedSlug?: string | null;
  drag: DragState | null;
  onDragStart: (slug: string) => void;
  onDragEnd: () => void;
  onDropBefore: (beforeSlug: string) => void;
  onDropAtEnd: () => void;
}) {
  // Where a dragged Scene would land in THIS act row: { index, x } — index is
  // 0..N (N = the very end), x is the insertion line's offset (px from the
  // row's left edge). null = not the current drop target. Only the row under
  // the cursor shows a single insertion line (no whole-row highlight).
  const [drop, setDrop] = useState<{ index: number; x: number } | null>(null);
  // Hovered beat for the tooltip (null = none). Anchored to the beat's rect.
  const [tip, setTip] = useState<BeatTip | null>(null);

  const showTip = (beat: BeatDto, e: React.MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ beat, x: r.left + r.width / 2, y: r.top });
  };
  const hideTip = () => setTip(null);

  // Cursor → insertion point: before the first block whose midpoint is past the
  // cursor, else after the last (the end). The line sits in the gap at that
  // boundary, so the director sees exactly where the drop lands — including the
  // act's very start (0) and very end (N).
  function dropTargetFrom(
    container: HTMLElement,
    clientX: number,
  ): { index: number; x: number } {
    const rect = container.getBoundingClientRect();
    const blocks = Array.from(container.children).filter((el) =>
      el.classList.contains("canvas-scene"),
    ) as HTMLElement[];
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i]!.getBoundingClientRect();
      if (clientX < b.left + b.width / 2) {
        return { index: i, x: b.left - rect.left - 1 };
      }
    }
    const last = blocks[blocks.length - 1]?.getBoundingClientRect();
    return { index: blocks.length, x: last ? last.right - rect.left + 1 : 0 };
  }

  // Equal-width Scene blocks: each block owns 1/N of the row (length ignored).
  const blockWidthPct =
    act.sceneSlugs.length > 0 ? 100 / act.sceneSlugs.length : 0;

  // Beats split by kind. Span beats render as proportional bars; point beats as
  // pins, with their names shown above on two staggered tiers (by point order)
  // so adjacent moments (e.g. 오프닝/주제 명시) don't collide.
  const spans = act.beats.filter((b) => b.kind === "span");
  const points = act.beats.filter((b) => b.kind === "point");
  const pointTier = new Map(points.map((b, i) => [b.number, i % 2]));

  // Row width is max-normalized: the longest act = 100%, others relative to it.
  const rowWidthPct = ((act.pageEnd - act.pageStart) / maxSpan) * 100;

  return (
    <section className="canvas-act" aria-label={`${ACT_TITLES[act.id]} row`}>
      <div className="canvas-act__label">
        <span className="canvas-act__title">{ACT_TITLES[act.id]}</span>
        <span className="canvas-act__pages">
          {act.pageEnd - act.pageStart}p · {Math.round(act.pagePct)}%
        </span>
        <span className="canvas-act__count">
          {act.sceneSlugs.length} scene
          {act.sceneSlugs.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Body width is max-normalized — the longest act (act 2) fills the full
          width, shorter acts scale relative to it — so length differences show
          without wasting space. The label still reports each act's movie share. */}
      <div className="canvas-act__body" style={{ width: `${rowWidthPct}%` }}>
        {/* Point names above the ruler, positioned at each point's page, on two
            staggered tiers so adjacent moments don't collide. */}
        <div className="canvas-act__pointnames" role="presentation">
          {points.map((beat) => (
            <span
              key={beat.number}
              className="canvas-point-name"
              style={{
                left: `${beat.leftPct}%`,
                top: `${(pointTier.get(beat.number) ?? 0) * 0.85}rem`,
                transform: pointNameTransform(beat.leftPct),
              }}
              onMouseEnter={(e) => showTip(beat, e)}
              onMouseLeave={hideTip}
            >
              {beat.label}
            </span>
          ))}
        </div>

        {/* Beat ruler — span beats as proportional bars, point beats as pins,
            both positioned on the act's page timeline. Hover any beat for its
            full name + description. */}
        <div className="canvas-act__ruler" role="presentation">
          {spans.map((beat) => (
            <div
              key={beat.number}
              className="canvas-beat-span"
              style={{ left: `${beat.leftPct}%`, width: `${beat.widthPct}%` }}
              aria-label={`${beat.number}. ${beat.label} (${pageLabel(beat)}) — ${beat.description}`}
              onMouseEnter={(e) => showTip(beat, e)}
              onMouseLeave={hideTip}
            >
              <span className="canvas-beat-span__label">{beat.label}</span>
            </div>
          ))}
          {points.map((beat) => (
            <div
              key={beat.number}
              className="canvas-beat-point"
              style={{ left: `${beat.leftPct}%` }}
              aria-label={`${beat.number}. ${beat.label} (${pageLabel(beat)}) — ${beat.description}`}
              onMouseEnter={(e) => showTip(beat, e)}
              onMouseLeave={hideTip}
            >
              <span className="canvas-beat-point__pin" />
            </div>
          ))}
        </div>

      {/* Scene blocks — equal width, manifest order. The container is the drop
          zone: a single insertion line follows the cursor to the nearest gap
          (incl. the very start and end), and the drop lands exactly there. */}
      <div
        className="canvas-act__scenes"
        onDragOver={(e) => {
          if (!canDrag || !drag) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDrop(dropTargetFrom(e.currentTarget, e.clientX));
        }}
        onDragLeave={(e) => {
          // Clear only when the pointer leaves the row (not crossing a child).
          if (e.currentTarget === e.target) setDrop(null);
        }}
        onDrop={(e) => {
          if (!canDrag || !drag) return;
          e.preventDefault();
          const target = drop ?? dropTargetFrom(e.currentTarget, e.clientX);
          setDrop(null);
          if (target.index < act.sceneSlugs.length) {
            onDropBefore(act.sceneSlugs[target.index]!); // before that block
          } else {
            onDropAtEnd(); // the very end
          }
        }}
      >
        {drop && (
          <div
            className="canvas-scene-insert"
            style={{ left: `${drop.x}px` }}
            aria-hidden="true"
          />
        )}
        {act.sceneSlugs.length === 0 ? (
          <div className="canvas-act__empty">
            {canDrag && drag
              ? "— 여기에 드롭 —"
              : "— 이 막에 배치된 Scene 없음 —"}
          </div>
        ) : (
          act.sceneSlugs.map((slug) => (
            <a
              key={slug}
              className={`canvas-scene${
                drag?.slug === slug ? " canvas-scene--dragging" : ""
              }${
                selectedSlug === slug && !drag ? " canvas-scene--selected" : ""
              }`}
              style={{ width: `${blockWidthPct}%` }}
              href={`#scene-${slug}`}
              title={sluglineBySlug.get(slug) ?? slug}
              draggable={canDrag}
              onClick={(e) => {
                // Click (not drag) selects the Scene so the parent can show its
                // detail below. Without a handler, fall back to the hash jump.
                if (onSelectScene) {
                  e.preventDefault();
                  onSelectScene(slug);
                }
              }}
              onDragStart={(e) => {
                if (!canDrag) return;
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", slug);
                onDragStart(slug);
              }}
              onDragEnd={() => {
                setDrop(null);
                onDragEnd();
              }}
            >
              <span className="canvas-scene__slug">{slug}</span>
              <span className="canvas-scene__slugline">
                {sluglineBySlug.get(slug) ?? ""}
              </span>
            </a>
          ))
        )}
        </div>
      </div>

      {tip && (
        <div
          className="canvas-beat-tip"
          role="tooltip"
          style={{ left: tip.x, top: tip.y }}
        >
          <div className="canvas-beat-tip__head">
            {tip.beat.number}. {tip.beat.label}
            <span className="canvas-beat-tip__page">{pageLabel(tip.beat)}</span>
          </div>
          <div className="canvas-beat-tip__desc">{tip.beat.description}</div>
        </div>
      )}
    </section>
  );
}
