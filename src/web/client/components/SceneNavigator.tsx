import { Fragment, useState } from "react";
import type { CanvasActDto, MovieDto, SceneDto } from "../../shared/dto.js";
import { reorderScene } from "../upload-client.js";

const ACT_TITLES: Record<1 | 2 | 3, string> = { 1: "1막", 2: "2막", 3: "3막" };

interface Props {
  scenes: SceneDto[];
  /**
   * The BS2 acts (manifest grouping). When supplied, the list is grouped under
   * 1막/2막/3막 headers — **including empty acts**, so the director can see (and
   * cross ▲/▼ into) acts that have no Scenes yet. Optional: omit for a plain
   * flat list (no headers).
   */
  acts?: CanvasActDto[];
  /**
   * Called with the updated MovieDto after a successful reorder so the App can
   * refresh the sequence. When omitted the up/down controls are hidden (the
   * navigator becomes a read-only jump list, e.g. if a parent has no movie
   * state setter to update).
   */
  onMovieChanged?: (movie: MovieDto) => void;
}

export function SceneNavigator({ scenes, acts, onMovieChanged }: Props) {
  // Slug currently being reordered — disables its controls so a director can't
  // fire overlapping reorders (the server is the SSOT; we wait for its reply).
  const [busySlug, setBusySlug] = useState<string | null>(null);

  async function move(slug: string, direction: "up" | "down"): Promise<void> {
    if (!onMovieChanged || busySlug) return;
    setBusySlug(slug);
    try {
      const next = await reorderScene(slug, direction);
      onMovieChanged(next);
    } catch (err) {
      // Surface minimally — the server rejected (e.g. unknown scene). The
      // sequence on screen is still the last-known-good order, so a console
      // warning is enough for this lightweight control.
      console.warn("[scene reorder]", (err as Error).message);
    } finally {
      setBusySlug(null);
    }
  }

  const canReorder = onMovieChanged !== undefined;
  const sceneBySlug = new Map(scenes.map((s) => [s.slug, s]));

  // One Scene row + its reorder controls. `upDisabled`/`downDisabled` mark the
  // only true no-ops (act-1 first ↑ / act-3 last ↓); every other position can
  // move — within its act, or across the boundary into the adjacent act.
  function sceneItem(
    scene: SceneDto,
    upDisabled: boolean,
    downDisabled: boolean,
  ) {
    return (
      <li key={scene.slug} className="scene-nav__item">
        <a className="scene-nav__link" href={`#scene-${scene.slug}`}>
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
              disabled={upDisabled || busySlug !== null}
              title="Move earlier"
              aria-label={`Move ${scene.slug} earlier`}
            >
              ▲
            </button>
            <button
              type="button"
              className="scene-nav__move scene-nav__move--down"
              onClick={() => void move(scene.slug, "down")}
              disabled={downDisabled || busySlug !== null}
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
  // structure is always visible and an empty act is a reachable ▼/▲ target.
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
                <li className="scene-nav__act-empty">— 씬 없음 —</li>
              ) : (
                act.sceneSlugs.map((slug, idxInAct) => {
                  const scene = sceneBySlug.get(slug);
                  if (!scene) return null;
                  return sceneItem(
                    scene,
                    act.id === 1 && idxInAct === 0,
                    act.id === 3 && idxInAct === act.sceneSlugs.length - 1,
                  );
                })
              )}
            </Fragment>
          ))}
        </ol>
      </nav>
    );
  }

  // Fallback: plain flat list (no act grouping available).
  return (
    <nav className="scene-nav" aria-label="Scenes">
      <ol className="scene-nav__list">
        {scenes.map((scene, index) =>
          sceneItem(scene, index === 0, index === scenes.length - 1),
        )}
      </ol>
    </nav>
  );
}
