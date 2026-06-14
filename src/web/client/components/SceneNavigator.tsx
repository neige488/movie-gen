import { Fragment, useState } from "react";
import type { CanvasActDto, MovieDto, SceneDto } from "../../shared/dto.js";
import { reorderScene } from "../upload-client.js";

const ACT_TITLES: Record<1 | 2 | 3, string> = { 1: "1막", 2: "2막", 3: "3막" };

interface Props {
  scenes: SceneDto[];
  /**
   * The BS2 acts (manifest grouping). When supplied, an act header is inserted
   * before the first Scene of each act so the linear list shows where the acts
   * break — mirroring the canvas. Optional: omit for a plain list.
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
  // slug → act id, so we can drop an act header at each boundary in the list.
  const actOf = new Map<string, 1 | 2 | 3>();
  for (const a of acts ?? []) {
    for (const slug of a.sceneSlugs) actOf.set(slug, a.id);
  }
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

  return (
    <nav className="scene-nav" aria-label="Scenes">
      <ol className="scene-nav__list">
        {scenes.map((scene, index) => {
          const act = actOf.get(scene.slug);
          const prevAct =
            index > 0 ? actOf.get(scenes[index - 1]!.slug) : undefined;
          const showActHeader = act !== undefined && act !== prevAct;
          return (
          <Fragment key={scene.slug}>
            {showActHeader && (
              <li className="scene-nav__act" aria-hidden="true">
                {ACT_TITLES[act]}
              </li>
            )}
          <li className="scene-nav__item">
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
                  disabled={index === 0 || busySlug !== null}
                  title="Move earlier"
                  aria-label={`Move ${scene.slug} earlier`}
                >
                  ▲
                </button>
                <button
                  type="button"
                  className="scene-nav__move scene-nav__move--down"
                  onClick={() => void move(scene.slug, "down")}
                  disabled={index === scenes.length - 1 || busySlug !== null}
                  title="Move later"
                  aria-label={`Move ${scene.slug} later`}
                >
                  ▼
                </button>
              </div>
            )}
          </li>
          </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
