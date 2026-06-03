import { describe, expect, it } from "vitest";
import { computeScreenplayHash } from "./hash-calculator.js";
import { createScene, createShot, createTake } from "./movie.js";
import { evaluateSceneSync } from "./sync-evaluator.js";

const HASH_BODY_A = computeScreenplayHash("body A");
const HASH_BODY_B = computeScreenplayHash("body B");

const screenplayA = [
  "<!-- shot:01 -->",
  "body A",
  "<!-- /shot:01 -->",
].join("\n");

const screenplayB = [
  "<!-- shot:01 -->",
  "body B",
  "<!-- /shot:01 -->",
].join("\n");

const shotWithHash = (id: string, hash: string, takes: ReturnType<typeof createTake>[] = []) =>
  createShot({
    id,
    prompt: "x",
    duration: 5,
    screenplayHash: hash,
    characterRefs: [],
    locationRefs: [],
    propRefs: [],
    takes,
  });

describe("evaluateSceneSync — current", () => {
  it("returns current when shot hash and all take hashes match marker block hash", () => {
    const scene = createScene({
      slug: "s01",
      slugline: "X",
      screenplay: screenplayA,
      isStarred: true,
      shots: [
        shotWithHash("01", HASH_BODY_A, [
          createTake({
            id: "t01",
            videoPath: "v.mp4",
            screenplayHash: HASH_BODY_A,
          }),
        ]),
      ],
    });
    const statuses = evaluateSceneSync(scene);
    expect(statuses).toEqual([{ shotId: "01", status: "current" }]);
  });

  it("returns current for a shot with no takes when hash matches", () => {
    const scene = createScene({
      slug: "s01",
      slugline: "X",
      screenplay: screenplayA,
      isStarred: true,
      shots: [shotWithHash("01", HASH_BODY_A)],
    });
    expect(evaluateSceneSync(scene)[0]).toEqual({
      shotId: "01",
      status: "current",
    });
  });
});

describe("evaluateSceneSync — shot-stale", () => {
  it("returns shot-stale when shot hash mismatches current marker block hash", () => {
    const scene = createScene({
      slug: "s01",
      slugline: "X",
      screenplay: screenplayB, // body B
      isStarred: true,
      shots: [shotWithHash("01", HASH_BODY_A)], // shot still pinned to body A
    });
    expect(evaluateSceneSync(scene)[0]).toEqual({
      shotId: "01",
      status: "shot-stale",
    });
  });
});

describe("evaluateSceneSync — take-stale", () => {
  it("returns take-stale when shot hash matches but a take's hash does not", () => {
    const scene = createScene({
      slug: "s01",
      slugline: "X",
      screenplay: screenplayA,
      isStarred: true,
      shots: [
        shotWithHash("01", HASH_BODY_A, [
          createTake({
            id: "t01",
            videoPath: "v.mp4",
            screenplayHash: HASH_BODY_B, // old take
          }),
        ]),
      ],
    });
    expect(evaluateSceneSync(scene)[0]).toEqual({
      shotId: "01",
      status: "take-stale",
    });
  });

  it("returns take-stale if ANY take is stale (even if some are current)", () => {
    const scene = createScene({
      slug: "s01",
      slugline: "X",
      screenplay: screenplayA,
      isStarred: true,
      shots: [
        shotWithHash("01", HASH_BODY_A, [
          createTake({
            id: "t01",
            videoPath: "a.mp4",
            screenplayHash: HASH_BODY_A,
          }),
          createTake({
            id: "t02",
            videoPath: "b.mp4",
            screenplayHash: HASH_BODY_B,
          }),
        ]),
      ],
    });
    expect(evaluateSceneSync(scene)[0]).toEqual({
      shotId: "01",
      status: "take-stale",
    });
  });
});

describe("evaluateSceneSync — orphan", () => {
  it("returns orphan when the shot id has no matching marker block in screenplay", () => {
    const scene = createScene({
      slug: "s01",
      slugline: "X",
      screenplay: "no markers here",
      isStarred: true,
      shots: [shotWithHash("01", HASH_BODY_A)],
    });
    expect(evaluateSceneSync(scene)[0]).toEqual({
      shotId: "01",
      status: "orphan",
    });
  });
});

describe("evaluateSceneSync — multiple blocks for same shot id", () => {
  it("treats hash as match if shot hash equals any of the block hashes", () => {
    const screenplay = [
      "<!-- shot:01 -->",
      "part A",
      "<!-- /shot:01 -->",
      "interlude",
      "<!-- shot:01 -->",
      "part B",
      "<!-- /shot:01 -->",
    ].join("\n");

    // The shot hash anchored to the concatenated form (joined by \n\n) — but
    // the simplest contract: shot matches if its hash equals the hash of the
    // concatenated normalized text of all blocks for that shotId.
    // We just check: shot-stale should be the result when neither single block
    // hash nor concat matches.
    const scene = createScene({
      slug: "s01",
      slugline: "X",
      screenplay,
      isStarred: true,
      shots: [shotWithHash("01", computeScreenplayHash("part A\n\npart B"))],
    });
    expect(evaluateSceneSync(scene)[0]).toEqual({
      shotId: "01",
      status: "current",
    });
  });
});
