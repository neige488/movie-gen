import { describe, expect, it } from "vitest";
import { createProject, createScene, createShot } from "@domain/movie.js";
import { createMovieArrangement } from "@domain/movie-arrangement.js";
import { projectToMovieDto } from "./dto-mapper.js";

const SHOT = createShot({
  id: "01",
  prompt: "x",
  duration: 5,
  screenplayHash: "h",
});

function scene(slug: string, isStarred: boolean) {
  return createScene({
    slug,
    slugline: "X",
    screenplay: "<!-- shot:01 -->\nbody\n<!-- /shot:01 -->",
    isStarred,
    shots: [SHOT],
  });
}

describe("projectToMovieDto — manifest ordering", () => {
  it("orders MovieDto.scenes by the arrangement, not by slug", () => {
    const project = createProject({
      scenes: [scene("s01-a", true), scene("s02-b", true), scene("s03-c", true)],
      characters: [],
      locations: [],
      props: [],
    });
    const arrangement = createMovieArrangement([
      { id: 1, scenes: ["s03-c"] },
      { id: 2, scenes: ["s01-a"] },
      { id: 3, scenes: ["s02-b"] },
    ]);

    const dto = projectToMovieDto(project, arrangement);
    expect(dto.scenes.map((s) => s.slug)).toEqual([
      "s03-c",
      "s01-a",
      "s02-b",
    ]);
  });

  it("keeps non-starred scenes out of MovieDto.scenes but in allScenes", () => {
    const project = createProject({
      scenes: [scene("s01-a", true), scene("s02-b", false)],
      characters: [],
      locations: [],
      props: [],
    });
    const arrangement = createMovieArrangement([
      { id: 1, scenes: ["s01-a", "s02-b"] },
      { id: 2, scenes: [] },
      { id: 3, scenes: [] },
    ]);

    const dto = projectToMovieDto(project, arrangement);
    expect(dto.scenes.map((s) => s.slug)).toEqual(["s01-a"]);
    expect(dto.allScenes.map((s) => s.slug).sort()).toEqual([
      "s01-a",
      "s02-b",
    ]);
  });

  it("falls back to slug order when no arrangement is supplied", () => {
    const project = createProject({
      scenes: [scene("s02-b", true), scene("s01-a", true)],
      characters: [],
      locations: [],
      props: [],
    });
    const dto = projectToMovieDto(project);
    expect(dto.scenes.map((s) => s.slug)).toEqual(["s01-a", "s02-b"]);
  });
});
