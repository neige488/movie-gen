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
  setSceneStarred,
  setSceneSlugline,
  setSceneScreenplay,
  setTakeStarred,
  setShotPrompt,
  setShotDuration,
  setShotCharacterRefs,
  setShotLocationRefs,
  setShotPropRefs,
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

describe("setSceneStarred — Scene isStarred immutable update", () => {
  const mkShot = (id: string) =>
    createShot({ ...VALID_SHOT_BASE, id, duration: 5 });

  const mkScene = (slug: string, isStarred: boolean) =>
    createScene({
      slug,
      slugline: "INT. ROOM - DAY",
      screenplay: "x",
      isStarred,
      shots: [mkShot("01")],
    });

  it("flips a Scene's isStarred from false to true", () => {
    const project = createProject({
      scenes: [mkScene("s01-a", false), mkScene("s02-b", true)],
      characters: [],
      locations: [],
      props: [],
    });
    const next = setSceneStarred(project, "s01-a", true);
    expect(next.scenes.find((s) => s.slug === "s01-a")!.isStarred).toBe(true);
    // Other scene unchanged.
    expect(next.scenes.find((s) => s.slug === "s02-b")!.isStarred).toBe(true);
  });

  it("flips a Scene's isStarred from true to false (removes from sequence)", () => {
    const project = createProject({
      scenes: [mkScene("s01-a", true), mkScene("s02-b", true)],
      characters: [],
      locations: [],
      props: [],
    });
    const next = setSceneStarred(project, "s01-a", false);
    expect(movieSequence(next).map((s) => s.slug)).toEqual(["s02-b"]);
  });

  it("is a no-op when the value already matches (returns equivalent Project)", () => {
    const project = createProject({
      scenes: [mkScene("s01-a", true)],
      characters: [],
      locations: [],
      props: [],
    });
    const next = setSceneStarred(project, "s01-a", true);
    expect(next.scenes[0]!.isStarred).toBe(true);
  });

  it("throws if the Scene slug is unknown", () => {
    const project = createProject({
      scenes: [mkScene("s01-a", true)],
      characters: [],
      locations: [],
      props: [],
    });
    expect(() => setSceneStarred(project, "ghost", true)).toThrow(
      DomainInvariantError,
    );
  });

  it("preserves the Scene's shots, slugline, and screenplay on toggle", () => {
    const project = createProject({
      scenes: [mkScene("s01-a", false)],
      characters: [],
      locations: [],
      props: [],
    });
    const next = setSceneStarred(project, "s01-a", true);
    const after = next.scenes[0]!;
    expect(after.slug).toBe("s01-a");
    expect(after.slugline).toBe("INT. ROOM - DAY");
    expect(after.screenplay).toBe("x");
    expect(after.shots).toHaveLength(1);
    expect(after.shots[0]!.id).toBe("01");
  });

  it("returns a new Project reference (immutability)", () => {
    const project = createProject({
      scenes: [mkScene("s01-a", false)],
      characters: [],
      locations: [],
      props: [],
    });
    const next = setSceneStarred(project, "s01-a", true);
    expect(next).not.toBe(project);
    expect(project.scenes[0]!.isStarred).toBe(false); // original untouched
  });
});

describe("setTakeStarred — Shot invariant: at most 1 starred Take", () => {
  const baseTake = (id: string, isStarred = false) =>
    createTake({
      id,
      videoPath: `assets/${id}.mp4`,
      screenplayHash: "h",
      createdAt: "2026-06-03T10:00:00.000Z",
      isStarred,
    });

  const baseShot = (takes: ReturnType<typeof baseTake>[]) =>
    createShot({ ...VALID_SHOT_BASE, duration: 5, takes });

  const baseScene = (shot: ReturnType<typeof baseShot>) =>
    createScene({
      slug: "s01-a",
      slugline: "X",
      screenplay: "y",
      isStarred: true,
      shots: [shot],
    });

  function mkProject(shot: ReturnType<typeof baseShot>) {
    return createProject({
      scenes: [baseScene(shot)],
      characters: [],
      locations: [],
      props: [],
    });
  }

  it("flips a single Take from unstarred to starred", () => {
    const project = mkProject(baseShot([baseTake("t01")]));
    const next = setTakeStarred(project, "s01-a", "01", "t01", true);
    const reloaded = next.scenes[0]!.shots[0]!.takes[0]!;
    expect(reloaded.isStarred).toBe(true);
  });

  it("turns OFF an existing starred Take when a different Take is starred ON", () => {
    const project = mkProject(
      baseShot([baseTake("t01", true), baseTake("t02"), baseTake("t03")]),
    );
    const next = setTakeStarred(project, "s01-a", "01", "t02", true);
    const takes = next.scenes[0]!.shots[0]!.takes;
    expect(takes.find((t) => t.id === "t01")!.isStarred).toBe(false);
    expect(takes.find((t) => t.id === "t02")!.isStarred).toBe(true);
    expect(takes.find((t) => t.id === "t03")!.isStarred).toBe(false);
  });

  it("allows turning OFF the currently starred Take (no Take starred afterwards)", () => {
    const project = mkProject(
      baseShot([baseTake("t01", true), baseTake("t02")]),
    );
    const next = setTakeStarred(project, "s01-a", "01", "t01", false);
    const takes = next.scenes[0]!.shots[0]!.takes;
    expect(takes.every((t) => !t.isStarred)).toBe(true);
  });

  it("is a no-op when the value already matches", () => {
    const project = mkProject(
      baseShot([baseTake("t01", true), baseTake("t02")]),
    );
    const next = setTakeStarred(project, "s01-a", "01", "t01", true);
    expect(next.scenes[0]!.shots[0]!.takes.find((t) => t.id === "t01")!.isStarred).toBe(
      true,
    );
    expect(next.scenes[0]!.shots[0]!.takes.find((t) => t.id === "t02")!.isStarred).toBe(
      false,
    );
  });

  it("never produces more than one starred Take after any toggle", () => {
    // Sanity invariant: rapid toggling stays within the rule.
    let p = mkProject(
      baseShot([baseTake("t01"), baseTake("t02"), baseTake("t03")]),
    );
    p = setTakeStarred(p, "s01-a", "01", "t01", true);
    p = setTakeStarred(p, "s01-a", "01", "t02", true);
    p = setTakeStarred(p, "s01-a", "01", "t03", true);
    const starred = p.scenes[0]!.shots[0]!.takes.filter((t) => t.isStarred);
    expect(starred).toHaveLength(1);
    expect(starred[0]!.id).toBe("t03");
  });

  it("throws if Scene unknown", () => {
    const project = mkProject(baseShot([baseTake("t01")]));
    expect(() =>
      setTakeStarred(project, "ghost", "01", "t01", true),
    ).toThrow(DomainInvariantError);
  });

  it("throws if Shot unknown", () => {
    const project = mkProject(baseShot([baseTake("t01")]));
    expect(() =>
      setTakeStarred(project, "s01-a", "99", "t01", true),
    ).toThrow(DomainInvariantError);
  });

  it("throws if Take unknown", () => {
    const project = mkProject(baseShot([baseTake("t01")]));
    expect(() =>
      setTakeStarred(project, "s01-a", "01", "ghost", true),
    ).toThrow(DomainInvariantError);
  });

  it("returns a new Project reference (immutability of the input)", () => {
    const project = mkProject(baseShot([baseTake("t01"), baseTake("t02")]));
    const next = setTakeStarred(project, "s01-a", "01", "t01", true);
    expect(next).not.toBe(project);
    // Original still has no starred.
    expect(
      project.scenes[0]!.shots[0]!.takes.every((t) => !t.isStarred),
    ).toBe(true);
  });

  it("does not touch other Shots in the same Scene", () => {
    // Two shots: shot 01 starred t01-a, shot 02 starred t02-x.
    const project = createProject({
      scenes: [
        createScene({
          slug: "s01-a",
          slugline: "X",
          screenplay: "y",
          isStarred: true,
          shots: [
            createShot({
              ...VALID_SHOT_BASE,
              id: "01",
              duration: 5,
              takes: [baseTake("t01-a", true), baseTake("t01-b")],
            }),
            createShot({
              ...VALID_SHOT_BASE,
              id: "02",
              duration: 5,
              takes: [baseTake("t02-x", true)],
            }),
          ],
        }),
      ],
      characters: [],
      locations: [],
      props: [],
    });
    const next = setTakeStarred(project, "s01-a", "01", "t01-b", true);
    // Shot 01 — flip happened.
    expect(
      next.scenes[0]!.shots[0]!.takes.find((t) => t.id === "t01-a")!.isStarred,
    ).toBe(false);
    expect(
      next.scenes[0]!.shots[0]!.takes.find((t) => t.id === "t01-b")!.isStarred,
    ).toBe(true);
    // Shot 02 — untouched.
    expect(
      next.scenes[0]!.shots[1]!.takes.find((t) => t.id === "t02-x")!.isStarred,
    ).toBe(true);
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

// ---------------------------------------------------------------------------
// setSceneSlugline / setSceneScreenplay — Light edit (Slice 5) mutators.
//
// Both return a new Project (immutable), validate the Scene exists, and
// preserve every other field on the Scene (shots, isStarred, the other text
// field). Reference integrity is re-checked via createProject so the helper
// is safe even if a future edit path tried to mutate something else.
// ---------------------------------------------------------------------------

describe("setSceneSlugline — Scene slugline immutable update", () => {
  const mkShot = (id: string) =>
    createShot({ ...VALID_SHOT_BASE, id, duration: 5 });
  const mkScene = (slug: string, slugline: string) =>
    createScene({
      slug,
      slugline,
      screenplay: "<!-- shot:01 -->\nbody\n<!-- /shot:01 -->",
      isStarred: true,
      shots: [mkShot("01")],
    });

  it("updates slugline and leaves other fields untouched", () => {
    const project = createProject({
      scenes: [mkScene("s01-a", "INT. ROOM - DAY")],
      characters: [],
      locations: [],
      props: [],
    });
    const next = setSceneSlugline(project, "s01-a", "EXT. STREET - NIGHT");
    const scene = next.scenes[0]!;
    expect(scene.slugline).toBe("EXT. STREET - NIGHT");
    expect(scene.slug).toBe("s01-a");
    expect(scene.screenplay).toBe(
      "<!-- shot:01 -->\nbody\n<!-- /shot:01 -->",
    );
    expect(scene.isStarred).toBe(true);
    expect(scene.shots).toHaveLength(1);
  });

  it("returns a new Project (immutability of input)", () => {
    const project = createProject({
      scenes: [mkScene("s01-a", "INT. ROOM - DAY")],
      characters: [],
      locations: [],
      props: [],
    });
    const next = setSceneSlugline(project, "s01-a", "EXT. STREET - NIGHT");
    expect(next).not.toBe(project);
    expect(project.scenes[0]!.slugline).toBe("INT. ROOM - DAY");
  });

  it("throws if Scene slug unknown", () => {
    const project = createProject({
      scenes: [mkScene("s01-a", "INT. ROOM - DAY")],
      characters: [],
      locations: [],
      props: [],
    });
    expect(() => setSceneSlugline(project, "ghost", "X")).toThrow(
      DomainInvariantError,
    );
  });

  it("rejects empty slugline (createScene invariant)", () => {
    const project = createProject({
      scenes: [mkScene("s01-a", "INT. ROOM - DAY")],
      characters: [],
      locations: [],
      props: [],
    });
    expect(() => setSceneSlugline(project, "s01-a", "")).toThrow(
      DomainInvariantError,
    );
  });
});

describe("setSceneScreenplay — Scene screenplay immutable update", () => {
  const mkShot = (id: string) =>
    createShot({ ...VALID_SHOT_BASE, id, duration: 5 });
  const mkScene = (slug: string, screenplay: string) =>
    createScene({
      slug,
      slugline: "INT. ROOM - DAY",
      screenplay,
      isStarred: true,
      shots: [mkShot("01")],
    });

  it("replaces screenplay text and preserves other fields", () => {
    const project = createProject({
      scenes: [
        mkScene("s01-a", "<!-- shot:01 -->\nold\n<!-- /shot:01 -->"),
      ],
      characters: [],
      locations: [],
      props: [],
    });
    const next = setSceneScreenplay(
      project,
      "s01-a",
      "<!-- shot:01 -->\nnew text\n<!-- /shot:01 -->",
    );
    const scene = next.scenes[0]!;
    expect(scene.screenplay).toBe(
      "<!-- shot:01 -->\nnew text\n<!-- /shot:01 -->",
    );
    expect(scene.slug).toBe("s01-a");
    expect(scene.slugline).toBe("INT. ROOM - DAY");
    expect(scene.isStarred).toBe(true);
    expect(scene.shots).toHaveLength(1);
  });

  it("returns a new Project (immutability of input)", () => {
    const project = createProject({
      scenes: [mkScene("s01-a", "<!-- shot:01 -->\nA\n<!-- /shot:01 -->")],
      characters: [],
      locations: [],
      props: [],
    });
    const next = setSceneScreenplay(
      project,
      "s01-a",
      "<!-- shot:01 -->\nB\n<!-- /shot:01 -->",
    );
    expect(next).not.toBe(project);
    expect(project.scenes[0]!.screenplay).toBe(
      "<!-- shot:01 -->\nA\n<!-- /shot:01 -->",
    );
  });

  it("throws if Scene slug unknown", () => {
    const project = createProject({
      scenes: [mkScene("s01-a", "<!-- shot:01 -->\nA\n<!-- /shot:01 -->")],
      characters: [],
      locations: [],
      props: [],
    });
    expect(() => setSceneScreenplay(project, "ghost", "anything")).toThrow(
      DomainInvariantError,
    );
  });
});

// ---------------------------------------------------------------------------
// Shot meta mutators — Slice 7 (Shot edit)
// ---------------------------------------------------------------------------

describe("setShotPrompt — Shot prompt immutable update", () => {
  const mkShot = (id: string, prompt = "p") =>
    createShot({ ...VALID_SHOT_BASE, id, prompt, duration: 5 });
  const mkScene = (slug: string, shots: ReturnType<typeof mkShot>[]) =>
    createScene({
      slug,
      slugline: "INT. ROOM - DAY",
      screenplay: "<!-- shot:01 -->\nbody\n<!-- /shot:01 -->",
      isStarred: true,
      shots,
    });

  it("replaces prompt and preserves other Shot fields", () => {
    const project = createProject({
      scenes: [mkScene("s01-a", [mkShot("01", "old prompt")])],
      characters: [],
      locations: [],
      props: [],
    });
    const next = setShotPrompt(project, "s01-a", "01", "new prompt");
    const shot = next.scenes[0]!.shots[0]!;
    expect(shot.prompt).toBe("new prompt");
    expect(shot.duration).toBe(5);
    expect(shot.id).toBe("01");
  });

  it("returns a new Project (immutability)", () => {
    const project = createProject({
      scenes: [mkScene("s01-a", [mkShot("01", "old")])],
      characters: [],
      locations: [],
      props: [],
    });
    const next = setShotPrompt(project, "s01-a", "01", "new");
    expect(next).not.toBe(project);
    expect(project.scenes[0]!.shots[0]!.prompt).toBe("old");
  });

  it("throws if Scene slug unknown", () => {
    const project = createProject({
      scenes: [mkScene("s01-a", [mkShot("01")])],
      characters: [],
      locations: [],
      props: [],
    });
    expect(() => setShotPrompt(project, "ghost", "01", "p")).toThrow(
      DomainInvariantError,
    );
  });

  it("throws if Shot id unknown", () => {
    const project = createProject({
      scenes: [mkScene("s01-a", [mkShot("01")])],
      characters: [],
      locations: [],
      props: [],
    });
    expect(() => setShotPrompt(project, "s01-a", "99", "p")).toThrow(
      DomainInvariantError,
    );
  });

  it("rejects empty prompt (createShot invariant)", () => {
    const project = createProject({
      scenes: [mkScene("s01-a", [mkShot("01")])],
      characters: [],
      locations: [],
      props: [],
    });
    expect(() => setShotPrompt(project, "s01-a", "01", "")).toThrow(
      DomainInvariantError,
    );
  });
});

describe("setShotDuration — Shot duration immutable update", () => {
  const mkShot = (id: string, duration = 5) =>
    createShot({ ...VALID_SHOT_BASE, id, duration });
  const mkScene = (slug: string, shots: ReturnType<typeof mkShot>[]) =>
    createScene({
      slug,
      slugline: "INT. ROOM - DAY",
      screenplay: "<!-- shot:01 -->\nbody\n<!-- /shot:01 -->",
      isStarred: true,
      shots,
    });

  it("replaces duration and preserves other Shot fields", () => {
    const project = createProject({
      scenes: [mkScene("s01-a", [mkShot("01", 5)])],
      characters: [],
      locations: [],
      props: [],
    });
    const next = setShotDuration(project, "s01-a", "01", 12);
    const shot = next.scenes[0]!.shots[0]!;
    expect(shot.duration).toBe(12);
    expect(shot.prompt).toBe("wide shot of street");
  });

  it("accepts boundary values 4 and 15", () => {
    const project = createProject({
      scenes: [mkScene("s01-a", [mkShot("01", 5)])],
      characters: [],
      locations: [],
      props: [],
    });
    expect(setShotDuration(project, "s01-a", "01", 4).scenes[0]!.shots[0]!.duration).toBe(4);
    expect(setShotDuration(project, "s01-a", "01", 15).scenes[0]!.shots[0]!.duration).toBe(15);
  });

  it("rejects duration of 3 (below min)", () => {
    const project = createProject({
      scenes: [mkScene("s01-a", [mkShot("01", 5)])],
      characters: [],
      locations: [],
      props: [],
    });
    expect(() => setShotDuration(project, "s01-a", "01", 3)).toThrow(
      DomainInvariantError,
    );
  });

  it("rejects duration of 16 (above max)", () => {
    const project = createProject({
      scenes: [mkScene("s01-a", [mkShot("01", 5)])],
      characters: [],
      locations: [],
      props: [],
    });
    expect(() => setShotDuration(project, "s01-a", "01", 16)).toThrow(
      DomainInvariantError,
    );
  });

  it("rejects non-integer", () => {
    const project = createProject({
      scenes: [mkScene("s01-a", [mkShot("01", 5)])],
      characters: [],
      locations: [],
      props: [],
    });
    expect(() => setShotDuration(project, "s01-a", "01", 5.5)).toThrow(
      DomainInvariantError,
    );
  });

  it("throws if Shot id unknown", () => {
    const project = createProject({
      scenes: [mkScene("s01-a", [mkShot("01")])],
      characters: [],
      locations: [],
      props: [],
    });
    expect(() => setShotDuration(project, "s01-a", "99", 6)).toThrow(
      DomainInvariantError,
    );
  });
});

describe("setShotCharacterRefs — Shot characterRefs immutable update", () => {
  const headshot = "character-a/headshot.png";
  const mkLook = (name: string) =>
    createLook({
      name,
      bodyProfile: createBodyProfile(["a.png", "b.png", "c.png"]),
      faceProfile: createFaceProfile(["d.png", "e.png", "f.png", "g.png", "h.png"]),
    });
  const mkChar = (name: string, lookNames: string[]) =>
    createCharacter({ name, headshot, looks: lookNames.map(mkLook) });
  const mkShot = (id: string, refs: { character: string; look: string }[] = []) =>
    createShot({ ...VALID_SHOT_BASE, id, duration: 5, characterRefs: refs });
  const mkScene = (slug: string, shots: ReturnType<typeof mkShot>[]) =>
    createScene({
      slug,
      slugline: "INT. ROOM - DAY",
      screenplay: "<!-- shot:01 -->\nbody\n<!-- /shot:01 -->",
      isStarred: true,
      shots,
    });

  it("replaces characterRefs", () => {
    const project = createProject({
      scenes: [mkScene("s01-a", [mkShot("01")])],
      characters: [mkChar("character-a", ["look1", "look2"])],
      locations: [],
      props: [],
    });
    const next = setShotCharacterRefs(project, "s01-a", "01", [
      { character: "character-a", look: "look1" },
    ]);
    expect(next.scenes[0]!.shots[0]!.characterRefs).toEqual([
      { character: "character-a", look: "look1" },
    ]);
  });

  it("can clear characterRefs", () => {
    const project = createProject({
      scenes: [
        mkScene("s01-a", [mkShot("01", [{ character: "character-a", look: "look1" }])]),
      ],
      characters: [mkChar("character-a", ["look1"])],
      locations: [],
      props: [],
    });
    const next = setShotCharacterRefs(project, "s01-a", "01", []);
    expect(next.scenes[0]!.shots[0]!.characterRefs).toEqual([]);
  });

  it("rejects ref to unknown Character (createProject invariant)", () => {
    const project = createProject({
      scenes: [mkScene("s01-a", [mkShot("01")])],
      characters: [mkChar("character-a", ["look1"])],
      locations: [],
      props: [],
    });
    expect(() =>
      setShotCharacterRefs(project, "s01-a", "01", [
        { character: "ghost", look: "look1" },
      ]),
    ).toThrow(DomainInvariantError);
  });

  it("rejects ref to unknown Look on existing Character", () => {
    const project = createProject({
      scenes: [mkScene("s01-a", [mkShot("01")])],
      characters: [mkChar("character-a", ["look1"])],
      locations: [],
      props: [],
    });
    expect(() =>
      setShotCharacterRefs(project, "s01-a", "01", [
        { character: "character-a", look: "ghostLook" },
      ]),
    ).toThrow(DomainInvariantError);
  });

  it("throws if Shot id unknown", () => {
    const project = createProject({
      scenes: [mkScene("s01-a", [mkShot("01")])],
      characters: [mkChar("character-a", ["look1"])],
      locations: [],
      props: [],
    });
    expect(() =>
      setShotCharacterRefs(project, "s01-a", "99", []),
    ).toThrow(DomainInvariantError);
  });
});

describe("setShotLocationRefs — Shot locationRefs immutable update", () => {
  const mkShot = (id: string, refs: { location: string; reference?: string }[] = []) =>
    createShot({ ...VALID_SHOT_BASE, id, duration: 5, locationRefs: refs });
  const mkScene = (slug: string, shots: ReturnType<typeof mkShot>[]) =>
    createScene({
      slug,
      slugline: "INT. ROOM - DAY",
      screenplay: "<!-- shot:01 -->\nbody\n<!-- /shot:01 -->",
      isStarred: true,
      shots,
    });

  it("replaces locationRefs", () => {
    const project = createProject({
      scenes: [mkScene("s01-a", [mkShot("01")])],
      characters: [],
      locations: [createLocation({ name: "room", references: [] })],
      props: [],
    });
    const next = setShotLocationRefs(project, "s01-a", "01", [
      { location: "room", reference: "wide" },
    ]);
    expect(next.scenes[0]!.shots[0]!.locationRefs).toEqual([
      { location: "room", reference: "wide" },
    ]);
  });

  it("accepts refs without a reference name (optional field)", () => {
    const project = createProject({
      scenes: [mkScene("s01-a", [mkShot("01")])],
      characters: [],
      locations: [createLocation({ name: "room", references: [] })],
      props: [],
    });
    const next = setShotLocationRefs(project, "s01-a", "01", [
      { location: "room" },
    ]);
    expect(next.scenes[0]!.shots[0]!.locationRefs[0]!.location).toBe("room");
    expect(next.scenes[0]!.shots[0]!.locationRefs[0]!.reference).toBeUndefined();
  });

  it("rejects ref to unknown Location", () => {
    const project = createProject({
      scenes: [mkScene("s01-a", [mkShot("01")])],
      characters: [],
      locations: [createLocation({ name: "room", references: [] })],
      props: [],
    });
    expect(() =>
      setShotLocationRefs(project, "s01-a", "01", [{ location: "ghost" }]),
    ).toThrow(DomainInvariantError);
  });
});

describe("setShotPropRefs — Shot propRefs immutable update", () => {
  const mkShot = (id: string, refs: { prop: string; reference?: string }[] = []) =>
    createShot({ ...VALID_SHOT_BASE, id, duration: 5, propRefs: refs });
  const mkScene = (slug: string, shots: ReturnType<typeof mkShot>[]) =>
    createScene({
      slug,
      slugline: "INT. ROOM - DAY",
      screenplay: "<!-- shot:01 -->\nbody\n<!-- /shot:01 -->",
      isStarred: true,
      shots,
    });

  it("replaces propRefs", () => {
    const project = createProject({
      scenes: [mkScene("s01-a", [mkShot("01")])],
      characters: [],
      locations: [],
      props: [createProp({ name: "lamp", references: [] })],
    });
    const next = setShotPropRefs(project, "s01-a", "01", [
      { prop: "lamp", reference: "wide" },
    ]);
    expect(next.scenes[0]!.shots[0]!.propRefs).toEqual([
      { prop: "lamp", reference: "wide" },
    ]);
  });

  it("rejects ref to unknown Prop", () => {
    const project = createProject({
      scenes: [mkScene("s01-a", [mkShot("01")])],
      characters: [],
      locations: [],
      props: [createProp({ name: "lamp", references: [] })],
    });
    expect(() =>
      setShotPropRefs(project, "s01-a", "01", [{ prop: "ghost" }]),
    ).toThrow(DomainInvariantError);
  });
});
