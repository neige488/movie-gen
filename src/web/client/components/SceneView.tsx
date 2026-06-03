import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { MovieDto, SceneDto } from "../../shared/dto.js";
import { ShotCard } from "./ShotCard.js";
import { StarButton } from "./StarButton.js";
import { toggleSceneStarred } from "../upload-client.js";

interface Props {
  scene: SceneDto;
  onTakeUploaded: () => void;
  onMovieChanged: (movie: MovieDto) => void;
}

/**
 * Strip `<!-- shot:NN -->` / `<!-- /shot:NN -->` markers from the screenplay
 * before rendering. Per CONTEXT.md: "Markdown 렌더링 시 안 보임."
 *
 * The markers stay in the source-of-truth screenplay.md on disk (they survive
 * round-trips through Claude Code), but the viewer presents them invisibly.
 */
function stripShotMarkers(text: string): string {
  return text.replace(/<!--\s*\/?shot:[^\s]+\s*-->\n?/g, "");
}

export function SceneView({ scene, onTakeUploaded, onMovieChanged }: Props) {
  const visibleScreenplay = stripShotMarkers(scene.screenplay);

  async function handleStarToggle(next: boolean): Promise<void> {
    const movie = await toggleSceneStarred(scene.slug, next);
    onMovieChanged(movie);
  }

  return (
    <section id={`scene-${scene.slug}`} className="scene">
      <header className="scene__header">
        <div className="scene__heading">
          <div className="scene__slug">{scene.slug}</div>
          <h2 className="scene__slugline">{scene.slugline}</h2>
        </div>
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
      </header>

      <div className="scene__body">
        <div className="scene__screenplay">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {visibleScreenplay}
          </ReactMarkdown>
        </div>
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
