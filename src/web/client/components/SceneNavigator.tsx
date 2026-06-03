import type { SceneDto } from "../../shared/dto.js";

interface Props {
  scenes: SceneDto[];
}

export function SceneNavigator({ scenes }: Props) {
  return (
    <nav className="scene-nav" aria-label="Scenes">
      <ol className="scene-nav__list">
        {scenes.map((scene) => (
          <li key={scene.slug} className="scene-nav__item">
            <a className="scene-nav__link" href={`#scene-${scene.slug}`}>
              <span className="scene-nav__slug">{scene.slug}</span>
              <span className="scene-nav__slugline">{scene.slugline}</span>
              <span className="scene-nav__count">
                {scene.shots.length} shot
                {scene.shots.length === 1 ? "" : "s"}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
