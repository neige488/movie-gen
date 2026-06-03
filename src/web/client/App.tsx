import { useEffect, useState } from "react";
import type { MovieDto } from "../shared/dto.js";
import { SceneNavigator } from "./components/SceneNavigator.js";
import { SceneView } from "./components/SceneView.js";

type FetchState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ok"; movie: MovieDto };

export function App() {
  const [state, setState] = useState<FetchState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/movie")
      .then(async (r) => {
        if (!r.ok) {
          throw new Error(`api returned ${r.status}`);
        }
        return (await r.json()) as MovieDto;
      })
      .then((movie) => {
        if (!cancelled) setState({ kind: "ok", movie });
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ kind: "error", message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "loading") {
    return <div className="status">Loading project…</div>;
  }
  if (state.kind === "error") {
    return (
      <div className="status status--error">
        Failed to load project: {state.message}
      </div>
    );
  }

  const { movie } = state;
  if (movie.scenes.length === 0) {
    return (
      <div className="status">
        No starred scenes — add <code>isStarred: true</code> to a scene to
        include it in the movie sequence.
      </div>
    );
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1 className="sidebar__title">Movie Gen</h1>
        <SceneNavigator scenes={movie.scenes} />
        <div className="sidebar__meta">
          <div>
            <strong>{movie.scenes.length}</strong> starred scene
            {movie.scenes.length === 1 ? "" : "s"}
          </div>
          <div>
            <strong>{movie.allScenes.length}</strong> total
          </div>
          <div>
            <strong>{movie.characters.length}</strong> character
            {movie.characters.length === 1 ? "" : "s"}
          </div>
          <div>
            <strong>{movie.locations.length}</strong> location
            {movie.locations.length === 1 ? "" : "s"}
          </div>
          <div>
            <strong>{movie.props.length}</strong> prop
            {movie.props.length === 1 ? "" : "s"}
          </div>
        </div>
      </aside>
      <main className="main">
        {movie.scenes.map((scene) => (
          <SceneView key={scene.slug} scene={scene} />
        ))}
      </main>
    </div>
  );
}
