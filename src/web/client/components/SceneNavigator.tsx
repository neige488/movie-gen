import { Fragment, useState } from "react";
import type { CanvasActDto, MovieDto, SceneDto } from "../../shared/dto.js";
import { moveSceneToAct, reorderScene } from "../upload-client.js";

const ACT_TITLES: Record<1 | 2 | 3, string> = { 1: "1막", 2: "2막", 3: "3막" };

/** Where a dragged Scene would land: an act + the slug to insert before (null = act end). */
interface DropTarget {
  actId: 1 | 2 | 3;
  beforeSlug: string | null;
}

interface Props {
  scenes: SceneDto[];
  /**
   * The BS2 acts (manifest grouping). When supplied, the list is grouped under
   * 1막/2막/3막 headers — **including empty acts** — and drag-and-drop reorder
   * is enabled (drag a Scene to any slot, across acts too). Optional: omit for
   * a plain flat list (▲/▼ only, no headers/DnD).
   */
  acts?: CanvasActDto[];
  /**
   * Called with the updated MovieDto after a successful reorder/move so the App
   * can refresh the sequence. When omitted the controls are hidden (the
   * navigator becomes a read-only jump list).
   */
  onMovieChanged?: (movie: MovieDto) => void;
  /**
   * When supplied, clicking a Scene calls this (instead of the `#scene-<slug>`
   * jump) — used by the Canvas view to select the Scene and show its detail
   * below the canvas. `selectedSlug` highlights the current one.
   */
  onSelectScene?: (slug: string) => void;
  selectedSlug?: string | null;
}

export function SceneNavigator({
  scenes,
  acts,
  onMovieChanged,
  onSelectScene,
  selectedSlug,
}: Props) {
  // Slug with an in-flight reorder/move — disables controls so a director can't
  // fire overlapping changes (the server is the SSOT; we wait for its reply).
  const [busySlug, setBusySlug] = useState<string | null>(null);
  // Drag-and-drop state: what's being dragged + where it would land.
  const [dragSlug, setDragSlug] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  async function move(slug: string, direction: "up" | "down"): Promise<void> {
    if (!onMovieChanged || busySlug) return;
    setBusySlug(slug);
    try {
      onMovieChanged(await reorderScene(slug, direction));
    } catch (err) {
      console.warn("[scene reorder]", (err as Error).message);
    } finally {
      setBusySlug(null);
    }
  }

  function endDrag(): void {
    setDragSlug(null);
    setDropTarget(null);
  }

  async function dropMove(
    slug: string,
    actId: 1 | 2 | 3,
    beforeSlug: string | null,
  ): Promise<void> {
    // Dropping a Scene before itself is a no-op.
    if (!onMovieChanged || busySlug || beforeSlug === slug) {
      endDrag();
      return;
    }
    setBusySlug(slug);
    try {
      onMovieChanged(await moveSceneToAct(slug, actId, beforeSlug));
    } catch (err) {
      console.warn("[scene move]", (err as Error).message);
    } finally {
      setBusySlug(null);
      endDrag();
    }
  }

  const canReorder = onMovieChanged !== undefined;
  const sceneBySlug = new Map(scenes.map((s) => [s.slug, s]));

  // One Scene row. `dnd` (grouped mode only) enables drag-and-drop: the row is
  // draggable and a drop target, showing a single insertion line at the cursor
  // (before this row, or — for the act's last row — at the act's end).
  function sceneItem(
    scene: SceneDto,
    opts: {
      upDisabled: boolean;
      downDisabled: boolean;
      dnd?: { actId: 1 | 2 | 3; nextSlug: string | null };
    },
  ) {
    const { dnd } = opts;
    const dragging = dnd !== undefined && dragSlug === scene.slug;
    const dropBefore =
      dnd !== undefined &&
      dropTarget?.actId === dnd.actId &&
      dropTarget.beforeSlug === scene.slug;
    // Only the act's last row renders the "drop at end" line (no next row to
    // own a before-line for the null anchor).
    const dropAfterEnd =
      dnd !== undefined &&
      dnd.nextSlug === null &&
      dropTarget?.actId === dnd.actId &&
      dropTarget.beforeSlug === null;

    return (
      <li
        key={scene.slug}
        className={`scene-nav__item${
          dragging ? " scene-nav__item--dragging" : ""
        }${dropBefore ? " scene-nav__item--drop-before" : ""}${
          dropAfterEnd ? " scene-nav__item--drop-after" : ""
        }`}
        onDragOver={
          dnd
            ? (e) => {
                if (!dragSlug) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                const r = e.currentTarget.getBoundingClientRect();
                const topHalf = e.clientY < r.top + r.height / 2;
                setDropTarget({
                  actId: dnd.actId,
                  beforeSlug: topHalf ? scene.slug : dnd.nextSlug,
                });
              }
            : undefined
        }
        onDrop={
          dnd
            ? (e) => {
                if (!dragSlug) return;
                e.preventDefault();
                const t = dropTarget;
                void dropMove(
                  dragSlug,
                  t?.actId ?? dnd.actId,
                  t ? t.beforeSlug : scene.slug,
                );
              }
            : undefined
        }
      >
        <a
          className={`scene-nav__link${
            selectedSlug === scene.slug ? " scene-nav__link--selected" : ""
          }`}
          href={`#scene-${scene.slug}`}
          draggable={dnd !== undefined}
          onClick={(e) => {
            if (onSelectScene) {
              e.preventDefault();
              onSelectScene(scene.slug);
            }
          }}
          onDragStart={
            dnd
              ? (e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", scene.slug);
                  setDragSlug(scene.slug);
                }
              : undefined
          }
          onDragEnd={dnd ? endDrag : undefined}
        >
          <span className="scene-nav__slug">{scene.slug}</span>
          <span className="scene-nav__slugline">{scene.slugline}</span>
          <span className="scene-nav__count">
            {scene.shots.length} shot
            {scene.shots.length === 1 ? "" : "s"}
          </span>
        </a>
        {canReorder && (
          <div
            className="scene-nav__reorder"
            role="group"
            aria-label={`Reorder ${scene.slug}`}
          >
            <button
              type="button"
              className="scene-nav__move scene-nav__move--up"
              onClick={() => void move(scene.slug, "up")}
              disabled={opts.upDisabled || busySlug !== null}
              title="Move earlier"
              aria-label={`Move ${scene.slug} earlier`}
            >
              ▲
            </button>
            <button
              type="button"
              className="scene-nav__move scene-nav__move--down"
              onClick={() => void move(scene.slug, "down")}
              disabled={opts.downDisabled || busySlug !== null}
              title="Move later"
              aria-label={`Move ${scene.slug} later`}
            >
              ▼
            </button>
          </div>
        )}
      </li>
    );
  }

  // Grouped rendering — every act gets a header, even empty ones, so the act
  // structure is always visible and an empty act is a reachable drop / ▲▼ target.
  if (acts && acts.length > 0) {
    return (
      <nav className="scene-nav" aria-label="Scenes">
        <ol className="scene-nav__list">
          {acts.map((act) => (
            <Fragment key={act.id}>
              <li className="scene-nav__act" aria-hidden="true">
                {ACT_TITLES[act.id]}
              </li>
              {act.sceneSlugs.length === 0 ? (
                <li
                  className={`scene-nav__act-empty${
                    canReorder &&
                    dragSlug &&
                    dropTarget?.actId === act.id &&
                    dropTarget.beforeSlug === null
                      ? " scene-nav__act-empty--drop"
                      : ""
                  }`}
                  onDragOver={
                    canReorder
                      ? (e) => {
                          if (!dragSlug) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          setDropTarget({ actId: act.id, beforeSlug: null });
                        }
                      : undefined
                  }
                  onDrop={
                    canReorder
                      ? (e) => {
                          if (!dragSlug) return;
                          e.preventDefault();
                          void dropMove(dragSlug, act.id, null);
                        }
                      : undefined
                  }
                >
                  {canReorder && dragSlug ? "— 여기에 드롭 —" : "— 씬 없음 —"}
                </li>
              ) : (
                act.sceneSlugs.map((slug, idxInAct) => {
                  const scene = sceneBySlug.get(slug);
                  if (!scene) return null;
                  return sceneItem(scene, {
                    upDisabled: act.id === 1 && idxInAct === 0,
                    downDisabled:
                      act.id === 3 && idxInAct === act.sceneSlugs.length - 1,
                    dnd: canReorder
                      ? {
                          actId: act.id,
                          nextSlug: act.sceneSlugs[idxInAct + 1] ?? null,
                        }
                      : undefined,
                  });
                })
              )}
            </Fragment>
          ))}
        </ol>
      </nav>
    );
  }

  // Fallback: plain flat list (no act grouping → no headers/DnD, ▲/▼ only).
  return (
    <nav className="scene-nav" aria-label="Scenes">
      <ol className="scene-nav__list">
        {scenes.map((scene, index) =>
          sceneItem(scene, {
            upDisabled: index === 0,
            downDisabled: index === scenes.length - 1,
          }),
        )}
      </ol>
    </nav>
  );
}
