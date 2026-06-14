import { useState } from "react";
import type { CanvasActDto, MovieDto } from "../../shared/dto.js";
import { moveSceneToAct } from "../upload-client.js";

/**
 * BS2 Canvas — draggable (slice #21, built on #20's read view).
 *
 * Renders the movie's starred Scenes across the 3 BS2 act rows. Each row shows:
 *  - a *beat ruler*: the act's BS2 beats laid out as proportional ticks whose
 *    widths come from Blake's page annotations (server-computed in BeatSheet,
 *    shipped in `CanvasActDto.beats`). A visual guide only.
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
}

export function BS2Canvas({ movie, onMovieChanged }: Props) {
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
          sluglineBySlug={sluglineBySlug}
          canDrag={canDrag}
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
  sluglineBySlug,
  canDrag,
  drag,
  onDragStart,
  onDragEnd,
  onDropBefore,
  onDropAtEnd,
}: {
  act: CanvasActDto;
  sluglineBySlug: Map<string, string>;
  canDrag: boolean;
  drag: DragState | null;
  onDragStart: (slug: string) => void;
  onDragEnd: () => void;
  onDropBefore: (beforeSlug: string) => void;
  onDropAtEnd: () => void;
}) {
  const [isOver, setIsOver] = useState(false);

  // Equal-width Scene blocks: each block owns 1/N of the row (length ignored).
  const blockWidthPct =
    act.sceneSlugs.length > 0 ? 100 / act.sceneSlugs.length : 0;

  const allowDrop = (e: React.DragEvent) => {
    if (!canDrag || !drag) return;
    e.preventDefault(); // mark as a valid drop target
    e.dataTransfer.dropEffect = "move";
  };

  return (
    <section className="canvas-act" aria-label={`${ACT_TITLES[act.id]} row`}>
      <div className="canvas-act__label">
        <span className="canvas-act__title">{ACT_TITLES[act.id]}</span>
        <span className="canvas-act__count">
          {act.sceneSlugs.length} scene
          {act.sceneSlugs.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Beat ruler — proportional ticks (Blake page-span widths). */}
      <div className="canvas-act__ruler" role="presentation">
        {act.beats.map((beat) => (
          <div
            key={beat.number}
            className="canvas-beat"
            style={{ width: `${beat.widthPct}%` }}
            title={`${beat.number}. ${beat.label} (p.${
              beat.startPage === beat.endPage
                ? beat.startPage
                : `${beat.startPage}-${beat.endPage}`
            })`}
          >
            <span className="canvas-beat__label">{beat.label}</span>
          </div>
        ))}
      </div>

      {/* Scene blocks — equal width, manifest order. The whole row is a drop
          zone: dropping over a block lands BEFORE it; dropping on the row's
          empty area lands at the END of the row. */}
      <div
        className={`canvas-act__scenes${
          isOver ? " canvas-act__scenes--drop" : ""
        }`}
        onDragOver={allowDrop}
        onDragEnter={(e) => {
          if (!canDrag || !drag) return;
          e.preventDefault();
          setIsOver(true);
        }}
        onDragLeave={(e) => {
          // Only clear when the pointer actually leaves the row (not a child).
          if (e.currentTarget === e.target) setIsOver(false);
        }}
        onDrop={(e) => {
          if (!canDrag || !drag) return;
          e.preventDefault();
          setIsOver(false);
          onDropAtEnd(); // dropping on the row background = end of the row
        }}
      >
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
              }`}
              style={{ width: `${blockWidthPct}%` }}
              href={`#scene-${slug}`}
              title={sluglineBySlug.get(slug) ?? slug}
              draggable={canDrag}
              onDragStart={(e) => {
                if (!canDrag) return;
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", slug);
                onDragStart(slug);
              }}
              onDragEnd={() => onDragEnd()}
              onDragOver={allowDrop}
              onDrop={(e) => {
                if (!canDrag || !drag) return;
                e.preventDefault();
                e.stopPropagation(); // don't bubble to the row's end-drop
                setIsOver(false);
                onDropBefore(slug); // land before this block
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
    </section>
  );
}
