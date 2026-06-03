/**
 * Local dev server. Loads the Project from `data/` at boot (fail-fast on
 * schema / invariant errors per PRD), then serves the JSON DTO at /api/movie.
 *
 * The SPA is served by Vite in dev mode; in production this server would also
 * serve the built bundle — out of scope for slice #1.
 */

import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadProject, ProjectLoadError } from "@adapter/project-repository.js";
import { projectToMovieDto } from "./dto-mapper.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../../..");
const DATA_DIR =
  process.env.MOVIEGEN_DATA_DIR ?? path.join(PROJECT_ROOT, "data");
const PORT = Number(process.env.MOVIEGEN_PORT ?? 5174);

async function main(): Promise<void> {
  console.log(`[movie-gen] loading project from ${DATA_DIR}`);

  let movieDto;
  try {
    const project = await loadProject(DATA_DIR);
    movieDto = projectToMovieDto(project);
    console.log(
      `[movie-gen] loaded ${movieDto.allScenes.length} scenes ` +
        `(${movieDto.scenes.length} starred in movie sequence), ` +
        `${movieDto.characters.length} characters, ` +
        `${movieDto.locations.length} locations, ` +
        `${movieDto.props.length} props`,
    );
  } catch (err) {
    if (err instanceof ProjectLoadError) {
      console.error(`[movie-gen] FAILED TO LOAD PROJECT:\n  ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  const app = express();

  app.get("/api/movie", (_req, res) => {
    res.json(movieDto);
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.listen(PORT, () => {
    console.log(`[movie-gen] api ready at http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error("[movie-gen] fatal:", err);
  process.exit(1);
});
