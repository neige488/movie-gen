import { useEffect, useState } from "react";
import type { LibraryDto, MovieDto } from "../shared/dto.js";
import { SceneNavigator } from "./components/SceneNavigator.js";
import { SceneView } from "./components/SceneView.js";
import { BS2Canvas } from "./components/BS2Canvas.js";
import { LibraryPage } from "./components/LibraryPage.js";
import { useHashRoute, type Route } from "./hash-route.js";
import { toggleSceneStarred } from "./upload-client.js";
import {
  LiveReloadProvider,
  useLiveReloadStatus,
} from "./live-reload.js";

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
  // refetched after each upload / external change.
  //
  // We only flip to the "loading" state when we have nothing to show yet
  // (initial load or after an error). On a refresh-over-existing-data we keep
  // the current value so <LibraryPage> stays mounted — otherwise it unmounts,
  // the active tab resets to "characters", and a "Loading…" flash appears on
  // every post-upload refresh. Keeping it mounted also lets the just-uploaded
  // image swap in place and preserves the per-slot "uploaded" confirmation.
  function refreshLibrary(): void {
    setLibrary((prev) => (prev.kind === "ok" ? prev : { kind: "loading" }));
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

  // The live-reload SSE handler refetches /api/movie and (if relevant)
  // /api/library when the server announces an external change. We hand it
  // a single refresh that updates both — the server's reload-failed event
  // stays silent (the previous project is preserved server-side, so what
  // we already have on screen is still valid).
  function refreshAll(): void {
    refreshMovie();
    if (route.name === "library") refreshLibrary();
  }

  return (
    <LiveReloadProvider refresh={refreshAll}>
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
          ) : route.name === "canvas" ? (
            <CanvasMain movie={movie} onMovieChanged={handleMovieChanged} />
          ) : (
            <LibraryMain library={library} onUploaded={refreshLibrary} />
          )}
        </main>
        <DeferredRefreshToast />
      </div>
    </LiveReloadProvider>
  );
}

/**
 * Floating notification rendered when an external change arrived while an
 * editor was open. The director can keep typing — when they close the editor
 * the deferred refresh fires automatically. The "지금 새로고침" button forces
 * the refresh now (the user explicitly chooses to drop any unsaved draft).
 */
function DeferredRefreshToast() {
  const status = useLiveReloadStatus();
  if (!status?.pending) return null;
  return (
    <div className="live-reload-toast" role="status" aria-live="polite">
      <span className="live-reload-toast__icon" aria-hidden="true">
        ↻
      </span>
      <span className="live-reload-toast__text">
        다른 곳에서 변경됨 — 편집 중인 내용을 저장하거나 닫으면 자동으로
        새로고침됩니다.
      </span>
      <button
        type="button"
        className="live-reload-toast__force"
        onClick={status.forceRefresh}
      >
        지금 새로고침
      </button>
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
          className={`topnav__link ${route.name === "canvas" ? "topnav__link--active" : ""}`}
          href="#/canvas"
        >
          Canvas
        </a>
        <a
          className={`topnav__link ${route.name === "library" ? "topnav__link--active" : ""}`}
          href="#/library"
        >
          Library
        </a>
      </nav>
      {(route.name === "viewer" || route.name === "canvas") &&
        movie.kind === "ok" && (
        <>
          <SceneNavigator
            scenes={movie.value.scenes}
            onMovieChanged={onMovieChanged}
          />
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
          movie={movie.value}
          onTakeUploaded={onTakeUploaded}
          onMovieChanged={onMovieChanged}
        />
      ))}
    </>
  );
}

function CanvasMain({
  movie,
  onMovieChanged,
}: {
  movie: FetchState<MovieDto>;
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
  return <BS2Canvas movie={movie.value} onMovieChanged={onMovieChanged} />;
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
