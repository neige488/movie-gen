import { describe, expect, it } from "vitest";
import {
  createShot,
  createTake,
  createScene,
  createBodyProfile,
  createFaceProfile,
  createLook,
  createCharacter,
  createLocation,
  createProp,
  createProject,
  movieSequence,
  DomainInvariantError,
} from "./movie.js";

const VALID_SHOT_BASE = {
  id: "01",
  prompt: "wide shot of street",
  screenplayHash: "deadbeef",
  characterRefs: [],
  locationRefs: [],
  propRefs: [],
};

describe("Shot — duration invariant", () => {
  it("accepts duration of 4 seconds (lower bound)", () => {
    const shot = createShot({ ...VALID_SHOT_BASE, duration: 4 });
    expect(shot.duration).toBe(4);
  });

  it("accepts duration of 15 seconds (upper bound)", () => {
    const shot = createShot({ ...VALID_SHOT_BASE, duration: 15 });
    expect(shot.duration).toBe(15);
  });

  it("rejects duration of 3 seconds (below 4)", () => {
    expect(() => createShot({ ...VALID_SHOT_BASE, duration: 3 })).toThrow(
      DomainInvariantError,
    );
    expect(() => createShot({ ...VALID_SHOT_BASE, duration: 3 })).toThrow(
      /duration/i,
    );
  });

  it("rejects duration of 16 seconds (above 15)", () => {
    expect(() => createShot({ ...VALID_SHOT_BASE, duration: 16 })).toThrow(
      DomainInvariantError,
    );
  });

  it("rejects non-integer duration", () => {
    expect(() => createShot({ ...VALID_SHOT_BASE, duration: 4.5 })).toThrow(
      DomainInvariantError,
    );
  });
});

describe("Take — immutable starred snapshot", () => {
  it("creates an unstarred take by default", () => {
    const take = createTake({
      id: "t01",
      videoPath: "assets/takes/01.mp4",
      screenplayHash: "deadbeef",
      createdAt: "2026-06-03T10:00:00.000Z",
    });
    expect(take.isStarred).toBe(false);
  });

  it("creates a starred take when isStarred=true", () => {
    const take = createTake({
      id: "t01",
      videoPath: "assets/takes/01.mp4",
      screenplayHash: "deadbeef",
      createdAt: "2026-06-03T10:00:00.000Z",
      isStarred: true,
    });
    expect(take.isStarred).toBe(true);
  });

  it("requires createdAt (immutable provenance per CONTEXT.md)", () => {
    expect(() =>
      createTake({
        id: "t01",
        videoPath: "a.mp4",
        screenplayHash: "x",
        // @ts-expect-error — runtime check protects misuse from non-TS callers
        createdAt: undefined,
      }),
    ).toThrow(DomainInvariantError);
  });

  it("rejects empty createdAt", () => {
    expect(() =>
      createTake({
        id: "t01",
        videoPath: "a.mp4",
        screenplayHash: "x",
        createdAt: "",
      }),
    ).toThrow(DomainInvariantError);
  });

  it("preserves createdAt as ISO string", () => {
    const take = createTake({
      id: "t01",
      videoPath: "a.mp4",
      screenplayHash: "x",
      createdAt: "2026-06-03T10:00:00.000Z",
    });
    expect(take.createdAt).toBe("2026-06-03T10:00:00.000Z");
  });
});

describe("Scene — invariants", () => {
  const baseShot = (id: string, prevShotRef?: string) =>
    createShot({ ...VALID_SHOT_BASE, id, duration: 5, prevShotRef });

  it("aggregates shots in given order", () => {
    const scene = createScene({
      slug: "s01-open",
      slugline: "INT. ROOM - DAY",
      screenplay: "# body",
      isStarred: true,
      shots: [baseShot("01"), baseShot("02")],
    });
    expect(scene.shots.map((s) => s.id)).toEqual(["01", "02"]);
  });

  it("rejects duplicate shot ids within a scene", () => {
    expect(() =>
      createScene({
        slug: "s01-open",
        slugline: "INT. ROOM - DAY",
        screenplay: "# body",
        isStarred: true,
        shots: [baseShot("01"), baseShot("01")],
      }),
    ).toThrow(DomainInvariantError);
  });

  it("rejects prevShotRef pointing outside this scene's shots", () => {
    expect(() =>
      createScene({
        slug: "s01-open",
        slugline: "INT. ROOM - DAY",
        screenplay: "# body",
        isStarred: true,
        shots: [baseShot("01"), baseShot("02", "99")],
      }),
    ).toThrow(/prevShotRef/i);
  });

  it("accepts prevShotRef pointing to an earlier shot in the same scene", () => {
    const scene = createScene({
      slug: "s01-open",
      slugline: "INT. ROOM - DAY",
      screenplay: "# body",
      isStarred: true,
      shots: [baseShot("01"), baseShot("02", "01")],
    });
    expect(scene.shots[1]!.prevShotRef).toBe("01");
  });

  it("rejects prevShotRef pointing to a later shot (forward ref)", () => {
    expect(() =>
      createScene({
        slug: "s01-open",
        slugline: "INT. ROOM - DAY",
        screenplay: "# body",
        isStarred: true,
        shots: [baseShot("01", "02"), baseShot("02")],
      }),
    ).toThrow(/prevShotRef/i);
  });

  it("rejects more than one starred take in a single shot", () => {
    const starred = createTake({
      id: "t01",
      videoPath: "a.mp4",
      screenplayHash: "x",
      createdAt: "2026-06-03T10:00:00.000Z",
      isStarred: true,
    });
    const starred2 = createTake({
      id: "t02",
      videoPath: "b.mp4",
      screenplayHash: "x",
      createdAt: "2026-06-03T10:01:00.000Z",
      isStarred: true,
    });
    expect(() =>
      createShot({ ...VALID_SHOT_BASE, duration: 5, takes: [starred, starred2] }),
    ).toThrow(/starred/i);
  });

  it("allows exactly one starred take", () => {
    const t1 = createTake({
      id: "t01",
      videoPath: "a.mp4",
      screenplayHash: "x",
      createdAt: "2026-06-03T10:00:00.000Z",
      isStarred: true,
    });
    const t2 = createTake({
      id: "t02",
      videoPath: "b.mp4",
      screenplayHash: "x",
      createdAt: "2026-06-03T10:01:00.000Z",
    });
    const shot = createShot({
      ...VALID_SHOT_BASE,
      duration: 5,
      takes: [t1, t2],
    });
    expect(shot.takes.filter((t) => t.isStarred)).toHaveLength(1);
  });
});

describe("Look — BodyProfile (3 images) and FaceProfile (5 images)", () => {
  it("BodyProfile requires exactly 3 images", () => {
    expect(() => createBodyProfile(["a.png", "b.png"])).toThrow(
      DomainInvariantError,
    );
    expect(() =>
      createBodyProfile(["a.png", "b.png", "c.png", "d.png"]),
    ).toThrow(DomainInvariantError);
    expect(createBodyProfile(["a.png", "b.png", "c.png"]).images).toHaveLength(
      3,
    );
  });

  it("FaceProfile requires exactly 5 images", () => {
    expect(() => createFaceProfile(["a", "b", "c", "d"])).toThrow(
      DomainInvariantError,
    );
    expect(() => createFaceProfile(["a", "b", "c", "d", "e", "f"])).toThrow(
      DomainInvariantError,
    );
    expect(
      createFaceProfile(["a", "b", "c", "d", "e"]).images,
    ).toHaveLength(5);
  });

  it("Look composes one BodyProfile and one FaceProfile", () => {
    const look = createLook({
      name: "hoodie",
      bodyProfile: createBodyProfile(["b1", "b2", "b3"]),
      faceProfile: createFaceProfile(["f1", "f2", "f3", "f4", "f5"]),
    });
    expect(look.name).toBe("hoodie");
    expect(look.bodyProfile.images).toHaveLength(3);
    expect(look.faceProfile.images).toHaveLength(5);
  });
});

describe("Character — name + headshot + looks", () => {
  it("requires at least one look", () => {
    expect(() =>
      createCharacter({
        name: "alice",
        headshot: "headshot.png",
        looks: [],
      }),
    ).toThrow(DomainInvariantError);
  });

  it("rejects duplicate look names", () => {
    const mkLook = (name: string) =>
      createLook({
        name,
        bodyProfile: createBodyProfile(["b1", "b2", "b3"]),
        faceProfile: createFaceProfile(["f1", "f2", "f3", "f4", "f5"]),
      });
    expect(() =>
      createCharacter({
        name: "alice",
        headshot: "headshot.png",
        looks: [mkLook("hoodie"), mkLook("hoodie")],
      }),
    ).toThrow(/duplicate.*look/i);
  });
});

describe("Project — reference integrity", () => {
  const mkLook = (name: string) =>
    createLook({
      name,
      bodyProfile: createBodyProfile(["b1", "b2", "b3"]),
      faceProfile: createFaceProfile(["f1", "f2", "f3", "f4", "f5"]),
    });

  const mkScene = (slug: string, isStarred: boolean, shot: ReturnType<typeof createShot>) =>
    createScene({
      slug,
      slugline: "INT. ROOM - DAY",
      screenplay: "x",
      isStarred,
      shots: [shot],
    });

  it("rejects Shot referencing unknown Character", () => {
    const shot = createShot({
      ...VALID_SHOT_BASE,
      duration: 5,
      characterRefs: [{ character: "ghost", look: "hoodie" }],
    });
    const scene = mkScene("s01", true, shot);
    expect(() =>
      createProject({
        scenes: [scene],
        characters: [],
        locations: [],
        props: [],
      }),
    ).toThrow(/Character/);
  });

  it("rejects Shot referencing unknown Look on known Character", () => {
    const alice = createCharacter({
      name: "alice",
      headshot: "h.png",
      looks: [mkLook("hoodie")],
    });
    const shot = createShot({
      ...VALID_SHOT_BASE,
      duration: 5,
      characterRefs: [{ character: "alice", look: "suit" }],
    });
    expect(() =>
      createProject({
        scenes: [mkScene("s01", true, shot)],
        characters: [alice],
        locations: [],
        props: [],
      }),
    ).toThrow(/Look/);
  });

  it("rejects Shot referencing unknown Location", () => {
    const shot = createShot({
      ...VALID_SHOT_BASE,
      duration: 5,
      locationRefs: [{ location: "mars" }],
    });
    expect(() =>
      createProject({
        scenes: [mkScene("s01", true, shot)],
        characters: [],
        locations: [],
        props: [],
      }),
    ).toThrow(/Location/);
  });

  it("rejects Shot referencing unknown Prop", () => {
    const shot = createShot({
      ...VALID_SHOT_BASE,
      duration: 5,
      propRefs: [{ prop: "phantom" }],
    });
    expect(() =>
      createProject({
        scenes: [mkScene("s01", true, shot)],
        characters: [],
        locations: [],
        props: [],
      }),
    ).toThrow(/Prop/);
  });

  it("accepts a project with all refs resolved", () => {
    const alice = createCharacter({
      name: "alice",
      headshot: "h.png",
      looks: [mkLook("hoodie")],
    });
    const kitchen = createLocation({ name: "kitchen", references: [] });
    const knife = createProp({ name: "knife", references: [] });
    const shot = createShot({
      ...VALID_SHOT_BASE,
      duration: 5,
      characterRefs: [{ character: "alice", look: "hoodie" }],
      locationRefs: [{ location: "kitchen" }],
      propRefs: [{ prop: "knife" }],
    });
    const project = createProject({
      scenes: [mkScene("s01", true, shot)],
      characters: [alice],
      locations: [kitchen],
      props: [knife],
    });
    expect(project.scenes).toHaveLength(1);
  });
});

describe("movieSequence — isStarred scenes sorted by slug prefix", () => {
  const mkShot = (id: string) =>
    createShot({ ...VALID_SHOT_BASE, id, duration: 5 });

  const mkScene = (slug: string, isStarred: boolean) =>
    createScene({
      slug,
      slugline: "X",
      screenplay: "y",
      isStarred,
      shots: [mkShot("01")],
    });

  it("filters out non-starred scenes", () => {
    const project = createProject({
      scenes: [mkScene("s02-b", false), mkScene("s01-a", true)],
      characters: [],
      locations: [],
      props: [],
    });
    expect(movieSequence(project).map((s) => s.slug)).toEqual(["s01-a"]);
  });

  it("sorts starred scenes by slug ascending (folder prefix)", () => {
    const project = createProject({
      scenes: [
        mkScene("s03-c", true),
        mkScene("s01-a", true),
        mkScene("s02-b", true),
      ],
      characters: [],
      locations: [],
      props: [],
    });
    expect(movieSequence(project).map((s) => s.slug)).toEqual([
      "s01-a",
      "s02-b",
      "s03-c",
    ]);
  });
});
