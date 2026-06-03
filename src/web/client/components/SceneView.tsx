import { useState } from "react";
import type { MovieDto, SceneDto } from "../../shared/dto.js";
import { ShotCard } from "./ShotCard.js";
import { StarButton } from "./StarButton.js";
import { SluglineEditor } from "./SluglineEditor.js";
import { ScreenplayEditor } from "./ScreenplayEditor.js";
import { copySceneRequest, toggleSceneStarred } from "../upload-client.js";

interface Props {
  scene: SceneDto;
  onTakeUploaded: () => void;
  onMovieChanged: (movie: MovieDto) => void;
}

export function SceneView({ scene, onTakeUploaded, onMovieChanged }: Props) {
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  async function handleStarToggle(next: boolean): Promise<void> {
    const movie = await toggleSceneStarred(scene.slug, next);
    onMovieChanged(movie);
  }

  async function handleCopy(): Promise<void> {
    setCopyError(null);
    // prompt is intentional — small, dependency-free UI for an
    // infrequent action. A modal would be overkill here.
    const suggestion = `${scene.slug}-alt`;
    const raw = window.prompt(
      `Copy "${scene.slug}" to new slug (kebab-case, e.g. ${suggestion}):`,
      suggestion,
    );
    if (raw === null) return; // cancelled
    const newSlug = raw.trim();
    if (!newSlug) {
      setCopyError("new slug cannot be empty");
      return;
    }
    setCopyBusy(true);
    try {
      const { movie, newSlug: created } = await copySceneRequest(
        scene.slug,
        newSlug,
      );
      onMovieChanged(movie);
      // Navigate to the new (non-starred) scene via the sidebar's
      // Non-starred section so the director sees it appear immediately. No
      // automatic scroll — the new scene is unstarred so it won't be in the
      // main column anyway.
      console.info(`[movie-gen] copied to ${created}`);
    } catch (err) {
      setCopyError((err as Error).message);
    } finally {
      setCopyBusy(false);
    }
  }

  return (
    <section id={`scene-${scene.slug}`} className="scene">
      <header className="scene__header">
        <div className="scene__heading">
          <div className="scene__slug">{scene.slug}</div>
          <SluglineEditor
            sceneSlug={scene.slug}
            slugline={scene.slugline}
            onMovieChanged={onMovieChanged}
          />
        </div>
        <div className="scene__header-actions">
          <button
            type="button"
            className="scene__copy-btn"
            onClick={() => void handleCopy()}
            disabled={copyBusy}
            title={`Copy ${scene.slug} into a new scene folder`}
          >
            {copyBusy ? "Copying…" : "Copy"}
          </button>
          <StarButton
            isStarred={scene.isStarred}
            onToggle={handleStarToggle}
            title={
              scene.isStarred
                ? "Remove from movie sequence"
                : "Add to movie sequence"
            }
            ariaLabel={`Toggle Scene ${scene.slug} starred`}
          />
        </div>
      </header>

      {copyError && (
        <div className="scene__copy-error" role="alert">
          {copyError}
        </div>
      )}

      <div className="scene__body">
        <ScreenplayEditor
          sceneSlug={scene.slug}
          screenplay={scene.screenplay}
          onMovieChanged={onMovieChanged}
        />
        <aside className="scene__shots">
          {scene.shots.length === 0 ? (
            <div className="shot shot--empty">No shots yet.</div>
          ) : (
            scene.shots.map((shot) => (
              <ShotCard
                key={shot.id}
                shot={shot}
                sceneSlug={scene.slug}
                onTakeUploaded={onTakeUploaded}
                onMovieChanged={onMovieChanged}
              />
            ))
          )}
        </aside>
      </div>
    </section>
  );
}
