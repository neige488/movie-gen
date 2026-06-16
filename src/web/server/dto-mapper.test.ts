import { describe, expect, it } from "vitest";
import {
  createCharacter,
  createLocation,
  createLook,
  createProject,
  createScene,
  createShot,
} from "@domain/movie.js";
import { createMovieArrangement } from "@domain/movie-arrangement.js";
import { createPromptPreset } from "@domain/prompt-preset.js";
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
    // No arrangement → no canvas acts.
    expect(dto.acts).toBeUndefined();
  });
});

describe("projectToMovieDto — BS2 canvas acts", () => {
  it("groups starred scenes into 3 act rows by the arrangement", () => {
    const project = createProject({
      scenes: [
        scene("s01-a", true),
        scene("s02-b", true),
        scene("s03-c", true),
      ],
      characters: [],
      locations: [],
      props: [],
    });
    const arrangement = createMovieArrangement([
      { id: 1, scenes: ["s01-a"] },
      { id: 2, scenes: ["s02-b"] },
      { id: 3, scenes: ["s03-c"] },
    ]);

    const dto = projectToMovieDto(project, arrangement);
    expect(dto.acts).toBeDefined();
    expect(dto.acts!.map((a) => a.id)).toEqual([1, 2, 3]);
    expect(dto.acts![0]!.sceneSlugs).toEqual(["s01-a"]);
    expect(dto.acts![1]!.sceneSlugs).toEqual(["s02-b"]);
    expect(dto.acts![2]!.sceneSlugs).toEqual(["s03-c"]);
  });

  it("excludes non-starred scenes from the canvas acts (manifest still carries them)", () => {
    const project = createProject({
      scenes: [scene("s01-a", true), scene("s02-b", false)],
      characters: [],
      locations: [],
      props: [],
    });
    // Both scenes live in act 1 in the manifest, but only the starred one
    // shows on the canvas.
    const arrangement = createMovieArrangement([
      { id: 1, scenes: ["s01-a", "s02-b"] },
      { id: 2, scenes: [] },
      { id: 3, scenes: [] },
    ]);

    const dto = projectToMovieDto(project, arrangement);
    expect(dto.acts![0]!.sceneSlugs).toEqual(["s01-a"]);
    expect(dto.acts![1]!.sceneSlugs).toEqual([]);
    expect(dto.acts![2]!.sceneSlugs).toEqual([]);
  });

  it("preserves manifest order of starred scenes within an act", () => {
    const project = createProject({
      scenes: [
        scene("s01-a", true),
        scene("s02-b", true),
        scene("s03-c", true),
      ],
      characters: [],
      locations: [],
      props: [],
    });
    const arrangement = createMovieArrangement([
      { id: 1, scenes: ["s03-c", "s01-a", "s02-b"] },
      { id: 2, scenes: [] },
      { id: 3, scenes: [] },
    ]);

    const dto = projectToMovieDto(project, arrangement);
    expect(dto.acts![0]!.sceneSlugs).toEqual(["s03-c", "s01-a", "s02-b"]);
  });

  it("attaches the positioned BS2 beat ruler to each act (15 beats, point+span)", () => {
    const project = createProject({
      scenes: [scene("s01-a", true)],
      characters: [],
      locations: [],
      props: [],
    });
    const arrangement = createMovieArrangement([
      { id: 1, scenes: ["s01-a"] },
      { id: 2, scenes: [] },
      { id: 3, scenes: [] },
    ]);

    const dto = projectToMovieDto(project, arrangement);
    const allBeats = dto.acts!.flatMap((a) => a.beats);
    expect(allBeats).toHaveLength(15);
    // Beats are positioned on each act's page timeline (0 ≤ left, left+width ≤ 100);
    // point beats carry width 0, span beats a positive width.
    for (const beat of allBeats) {
      expect(beat.leftPct).toBeGreaterThanOrEqual(0);
      expect(beat.leftPct + beat.widthPct).toBeLessThanOrEqual(100 + 1e-9);
      expect(beat.kind === "point" ? beat.widthPct === 0 : beat.widthPct > 0).toBe(
        true,
      );
    }
    // Act 1 ruler starts at 오프닝 이미지 (a point at the timeline origin).
    expect(dto.acts![0]!.beats[0]!.label).toBe("오프닝 이미지");
    expect(dto.acts![0]!.beats[0]!.kind).toBe("point");
    expect(dto.acts![0]!.beats[0]!.leftPct).toBeCloseTo(0, 6);
  });

  it("scales each act to its page range (act 2 is the long one, ~55%)", () => {
    const project = createProject({
      scenes: [scene("s01-a", true)],
      characters: [],
      locations: [],
      props: [],
    });
    const arrangement = createMovieArrangement([
      { id: 1, scenes: ["s01-a"] },
      { id: 2, scenes: [] },
      { id: 3, scenes: [] },
    ]);

    const [a1, a2, a3] = projectToMovieDto(project, arrangement).acts!;
    expect([a1!.pageStart, a1!.pageEnd]).toEqual([1, 25]);
    expect([a2!.pageStart, a2!.pageEnd]).toEqual([25, 85]);
    expect([a3!.pageStart, a3!.pageEnd]).toEqual([85, 110]);
    // pagePct sums to 100 and act 2 dominates.
    expect(a1!.pagePct + a2!.pagePct + a3!.pagePct).toBeCloseTo(100, 6);
    expect(a2!.pagePct).toBeGreaterThan(a1!.pagePct + a3!.pagePct);
    expect(a2!.pagePct).toBeCloseTo((60 / 109) * 100, 6);
  });

  it("carries totalPages (defaults to 110, passes through a custom value)", () => {
    const project = createProject({
      scenes: [scene("s01-a", true)],
      characters: [],
      locations: [],
      props: [],
    });
    const arrangement = createMovieArrangement([
      { id: 1, scenes: ["s01-a"] },
      { id: 2, scenes: [] },
      { id: 3, scenes: [] },
    ]);
    expect(projectToMovieDto(project, arrangement).totalPages).toBe(110);
    expect(projectToMovieDto(project, arrangement, 90).totalPages).toBe(90);
  });
});

describe("projectToMovieDto — finalPrompt assembly", () => {
  const character = createCharacter({
    name: "character-a",
    headshot: "characters/character-a/headshot.png",
    looks: [
      createLook({
        name: "introspective",
        faceImage: "f.png",
        bodyImage: "b.png",
      }),
    ],
  });
  const location = createLocation({ name: "small-apartment", references: [] });

  function projectWithRefShot() {
    const shot = createShot({
      id: "01",
      prompt: "@p1_c_suah_face 클로즈업, @p1_l_rooftop_cafe 배경",
      duration: 6,
      screenplayHash: "h",
      characterRefs: [{ character: "character-a", look: "introspective" }],
      locationRefs: [{ location: "small-apartment", reference: "desk-corner" }],
    });
    return createProject({
      scenes: [
        createScene({
          slug: "s01-a",
          slugline: "X",
          screenplay: "<!-- shot:01 -->\nbody\n<!-- /shot:01 -->",
          isStarred: true,
          shots: [shot],
        }),
      ],
      characters: [character],
      locations: [location],
      props: [],
    });
  }

  it("wraps the shot prompt with the preset prefix and suffix (no ref block)", () => {
    const preset = createPromptPreset({
      prefix: "cinematic 4K",
      suffix: "워터마크 없음",
    });
    const dto = projectToMovieDto(projectWithRefShot(), undefined, 110, preset);
    expect(dto.scenes[0]!.shots[0]!.finalPrompt).toBe(
      [
        "cinematic 4K",
        "@p1_c_suah_face 클로즈업, @p1_l_rooftop_cafe 배경",
        "워터마크 없음",
      ].join("\n\n"),
    );
  });

  it("parses inline @mentions into refMentions", () => {
    const dto = projectToMovieDto(projectWithRefShot());
    expect(dto.scenes[0]!.shots[0]!.refMentions).toEqual([
      "p1_c_suah_face",
      "p1_l_rooftop_cafe",
    ]);
  });

  it("defaults to the identity preset (finalPrompt is just the prompt)", () => {
    const dto = projectToMovieDto(projectWithRefShot());
    expect(dto.scenes[0]!.shots[0]!.finalPrompt).toBe(
      "@p1_c_suah_face 클로즈업, @p1_l_rooftop_cafe 배경",
    );
  });
});
