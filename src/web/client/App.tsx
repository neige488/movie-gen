import { useEffect, useState } from "react";
import type { LibraryDto, MovieDto } from "../shared/dto.js";
import { SceneNavigator } from "./components/SceneNavigator.js";
import { SceneView } from "./components/SceneView.js";
import { LibraryPage } from "./components/LibraryPage.js";
import { useHashRoute, type Route } from "./hash-route.js";
import { toggleSceneStarred } from "./upload-client.js";

type FetchState<T> =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ok"; value: T };

export function App() {
  const route = useHashRoute();
  const [movie, setMovie] = useState<FetchState<MovieDto>>({ kind: "loading" });
  const [library, setLibrary] = useState<FetchState<LibraryDto>>({
    kind: "loading",
  });

  function refreshMovie(): void {
    fetch("/api/movie")
      .then(async (r) => {
        if (!r.ok) throw new Error(`api returned ${r.status}`);
        return (await r.json()) as MovieDto;
      })
      .then((value) => setMovie({ kind: "ok", value }))
      .catch((err: Error) =>
        setMovie({ kind: "error", message: err.message }),
      );
  }

  useEffect(() => {
    refreshMovie();
  }, []);

  // Library is fetched on-demand the first time the route asks for it, then
  // refetched whenever the library page re-mounts (after an upload).
  function refreshLibrary(): void {
    setLibrary({ kind: "loading" });
    fetch("/api/library")
      .then(async (r) => {
        if (!r.ok) throw new Error(`api returned ${r.status}`);
        return (await r.json()) as LibraryDto;
      })
      .then((value) => setLibrary({ kind: "ok", value }))
      .catch((err: Error) =>
        setLibrary({ kind: "error", message: err.message }),
      );
  }

  useEffect(() => {
    if (route.name === "library") {
      refreshLibrary();
    }
  }, [route.name]);

  function handleMovieChanged(nextMovie: MovieDto): void {
    setMovie({ kind: "ok", value: nextMovie });
  }

  return (
    <div className="layout">
      <Sidebar
        route={route}
        movie={movie}
        onMovieChanged={handleMovieChanged}
      />
      <main className="main">
        {route.name === "viewer" ? (
          <ViewerMain
            movie={movie}
            onTakeUploaded={refreshMovie}
            onMovieChanged={handleMovieChanged}
          />
        ) : (
          <LibraryMain library={library} onUploaded={refreshLibrary} />
        )}
      </main>
    </div>
  );
}

function Sidebar({
  route,
  movie,
  onMovieChanged,
}: {
  route: Route;
  movie: FetchState<MovieDto>;
  onMovieChanged: (movie: MovieDto) => void;
}) {
  return (
    <aside className="sidebar">
      <h1 className="sidebar__title">Movie Gen</h1>
      <nav className="topnav" aria-label="Sections">
        <a
          className={`topnav__link ${route.name === "viewer" ? "topnav__link--active" : ""}`}
          href="#/"
        >
          Scenes
        </a>
        <a
          className={`topnav__link ${route.name === "library" ? "topnav__link--active" : ""}`}
          href="#/library"
        >
          Library
        </a>
      </nav>
      {route.name === "viewer" && movie.kind === "ok" && (
        <>
          <SceneNavigator scenes={movie.value.scenes} />
          <NonStarredScenes
            movie={movie.value}
            onMovieChanged={onMovieChanged}
          />
          <div className="sidebar__meta">
            <div>
              <strong>{movie.value.scenes.length}</strong> starred scene
              {movie.value.scenes.length === 1 ? "" : "s"}
            </div>
            <div>
              <strong>{movie.value.allScenes.length}</strong> total
            </div>
            <div>
              <strong>{movie.value.characters.length}</strong> character
              {movie.value.characters.length === 1 ? "" : "s"}
            </div>
            <div>
              <strong>{movie.value.locations.length}</strong> location
              {movie.value.locations.length === 1 ? "" : "s"}
            </div>
            <div>
              <strong>{movie.value.props.length}</strong> prop
              {movie.value.props.length === 1 ? "" : "s"}
            </div>
          </div>
        </>
      )}
    </aside>
  );
}

/**
 * Non-starred Scenes list — lets the director star a Scene back into the
 * movie sequence without leaving the viewer. The main column shows only the
 * starred (sequence) Scenes per CONTEXT.md ("영화 시퀀스 = `isStarred=true`인
 * Scene들의 폴더명 prefix 정렬"), so this is the entry point for the inverse
 * toggle.
 */
function NonStarredScenes({
  movie,
  onMovieChanged,
}: {
  movie: MovieDto;
  onMovieChanged: (movie: MovieDto) => void;
}) {
  const offScenes = movie.allScenes.filter((s) => !s.isStarred);
  if (offScenes.length === 0) return null;
  async function turnOn(slug: string): Promise<void> {
    const next = await toggleSceneStarred(slug, true);
    onMovieChanged(next);
  }
  return (
    <section className="scene-nav scene-nav--off" aria-label="Non-starred scenes">
      <h2 className="scene-nav__header">Non-starred ({offScenes.length})</h2>
      <ol className="scene-nav__list">
        {offScenes.map((s) => (
          <li key={s.slug} className="scene-nav__item">
            <button
              type="button"
              className="scene-nav__off-toggle"
              onClick={() => void turnOn(s.slug)}
              title={`Add ${s.slug} to movie sequence`}
            >
              <span className="scene-nav__slug">{s.slug}</span>
              <span className="scene-nav__slugline">{s.slugline}</span>
              <span className="scene-nav__star-hint" aria-hidden="true">
                ☆
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ViewerMain({
  movie,
  onTakeUploaded,
  onMovieChanged,
}: {
  movie: FetchState<MovieDto>;
  onTakeUploaded: () => void;
  onMovieChanged: (movie: MovieDto) => void;
}) {
  if (movie.kind === "loading")
    return <div className="status">Loading project…</div>;
  if (movie.kind === "error")
    return (
      <div className="status status--error">
        Failed to load project: {movie.message}
      </div>
    );
  if (movie.value.scenes.length === 0) {
    return (
      <div className="status">
        No starred scenes — click ☆ next to a Non-starred scene in the sidebar
        to add it to the movie sequence.
      </div>
    );
  }
  return (
    <>
      {movie.value.scenes.map((scene) => (
        <SceneView
          key={scene.slug}
          scene={scene}
          onTakeUploaded={onTakeUploaded}
          onMovieChanged={onMovieChanged}
        />
      ))}
    </>
  );
}

function LibraryMain({
  library,
  onUploaded,
}: {
  library: FetchState<LibraryDto>;
  onUploaded: () => void;
}) {
  if (library.kind === "loading")
    return <div className="status">Loading library…</div>;
  if (library.kind === "error")
    return (
      <div className="status status--error">
        Failed to load library: {library.message}
      </div>
    );
  return <LibraryPage library={library.value} onUploaded={onUploaded} />;
}
