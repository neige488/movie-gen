import { describe, expect, it } from "vitest";
import {
  createMovieArrangement,
  reconcileArrangement,
  migrateArrangement,
  MovieArrangementError,
  type ActId,
} from "./movie-arrangement.js";

// ---------------------------------------------------------------------------
// Construction + invariants
// ---------------------------------------------------------------------------

describe("createMovieArrangement — construction & invariants", () => {
  it("builds a 3-act arrangement and exposes ordered slugs per act", () => {
    const arr = createMovieArrangement([
      { id: 1, scenes: ["s01", "s02"] },
      { id: 2, scenes: ["s03"] },
      { id: 3, scenes: [] },
    ]);
    expect(arr.scenesInAct(1)).toEqual(["s01", "s02"]);
    expect(arr.scenesInAct(2)).toEqual(["s03"]);
    expect(arr.scenesInAct(3)).toEqual([]);
  });

  it("linearSequence flattens act1 ++ act2 ++ act3 in order", () => {
    const arr = createMovieArrangement([
      { id: 1, scenes: ["a", "b"] },
      { id: 2, scenes: ["c"] },
      { id: 3, scenes: ["d", "e"] },
    ]);
    expect(arr.linearSequence()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("actOf returns the act id a slug belongs to", () => {
    const arr = createMovieArrangement([
      { id: 1, scenes: ["a"] },
      { id: 2, scenes: ["b"] },
      { id: 3, scenes: ["c"] },
    ]);
    expect(arr.actOf("a")).toBe(1);
    expect(arr.actOf("b")).toBe(2);
    expect(arr.actOf("c")).toBe(3);
    expect(arr.actOf("nope")).toBeUndefined();
  });

  it("rejects an arrangement that is not exactly acts 1,2,3 in order", () => {
    expect(() =>
      createMovieArrangement([
        { id: 1, scenes: [] },
        { id: 2, scenes: [] },
      ]),
    ).toThrow(MovieArrangementError);
    expect(() =>
      createMovieArrangement([
        { id: 2, scenes: [] },
        { id: 1, scenes: [] },
        { id: 3, scenes: [] },
      ]),
    ).toThrow(/act id/i);
    expect(() =>
      createMovieArrangement([
        { id: 1, scenes: [] },
        { id: 2, scenes: [] },
        { id: 4 as ActId, scenes: [] },
      ]),
    ).toThrow(MovieArrangementError);
  });

  it("rejects a slug that appears in more than one act (duplicate)", () => {
    expect(() =>
      createMovieArrangement([
        { id: 1, scenes: ["dup"] },
        { id: 2, scenes: ["dup"] },
        { id: 3, scenes: [] },
      ]),
    ).toThrow(/duplicate/i);
  });

  it("rejects a slug duplicated within a single act", () => {
    expect(() =>
      createMovieArrangement([
        { id: 1, scenes: ["x", "x"] },
        { id: 2, scenes: [] },
        { id: 3, scenes: [] },
      ]),
    ).toThrow(/duplicate/i);
  });
});

// ---------------------------------------------------------------------------
// moveScene
// ---------------------------------------------------------------------------

describe("moveScene", () => {
  function base() {
    return createMovieArrangement([
      { id: 1, scenes: ["a", "b", "c"] },
      { id: 2, scenes: ["d"] },
      { id: 3, scenes: [] },
    ]);
  }

  it("reorders within the same act (move 'a' to index 2)", () => {
    const next = base().moveScene("a", 1, 2);
    expect(next.scenesInAct(1)).toEqual(["b", "c", "a"]);
  });

  it("moves a scene to another act at a given index", () => {
    const next = base().moveScene("b", 2, 0);
    expect(next.scenesInAct(1)).toEqual(["a", "c"]);
    expect(next.scenesInAct(2)).toEqual(["b", "d"]);
    expect(next.actOf("b")).toBe(2);
  });

  it("clamps an out-of-range toIndex to the act's end", () => {
    const next = base().moveScene("a", 3, 99);
    expect(next.scenesInAct(3)).toEqual(["a"]);
  });

  it("treats a negative toIndex as 0 (front of act)", () => {
    const next = base().moveScene("d", 1, -5);
    expect(next.scenesInAct(1)[0]).toBe("d");
  });

  it("returns a new instance and leaves the original untouched (immutable)", () => {
    const arr = base();
    const next = arr.moveScene("a", 1, 2);
    expect(arr.scenesInAct(1)).toEqual(["a", "b", "c"]);
    expect(next).not.toBe(arr);
  });

  it("rejects moving an unknown slug", () => {
    expect(() => base().moveScene("ghost", 1, 0)).toThrow(
      MovieArrangementError,
    );
    expect(() => base().moveScene("ghost", 1, 0)).toThrow(/unknown/i);
  });

  it("rejects moving to an invalid act id", () => {
    expect(() => base().moveScene("a", 9 as ActId, 0)).toThrow(
      /act id/i,
    );
  });

  it("preserves the moved-within-act index when re-inserting after removal", () => {
    // Moving 'b' (currently index 1) to index 2 within act 1: after removing
    // 'b', remaining is [a, c]; inserting at index 2 yields [a, c, b].
    const next = base().moveScene("b", 1, 2);
    expect(next.scenesInAct(1)).toEqual(["a", "c", "b"]);
  });
});

// ---------------------------------------------------------------------------
// migrate (manifest absent)
// ---------------------------------------------------------------------------

describe("migrateArrangement — manifest absent", () => {
  it("puts every scene into act 1 in the given order", () => {
    const arr = migrateArrangement(["s01", "s02", "s03"]);
    expect(arr.scenesInAct(1)).toEqual(["s01", "s02", "s03"]);
    expect(arr.scenesInAct(2)).toEqual([]);
    expect(arr.scenesInAct(3)).toEqual([]);
  });

  it("produces an empty 3-act arrangement for no scenes", () => {
    const arr = migrateArrangement([]);
    expect(arr.linearSequence()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// reconcile (load-time drift between folders and manifest)
// ---------------------------------------------------------------------------

describe("reconcileArrangement", () => {
  it("appends folder scenes missing from the manifest to the end of act 1", () => {
    const manifest = createMovieArrangement([
      { id: 1, scenes: ["a"] },
      { id: 2, scenes: ["b"] },
      { id: 3, scenes: [] },
    ]);
    // 'c' exists on disk but not in the manifest.
    const reconciled = reconcileArrangement(manifest, ["a", "b", "c"]);
    expect(reconciled.scenesInAct(1)).toEqual(["a", "c"]);
    expect(reconciled.scenesInAct(2)).toEqual(["b"]);
  });

  it("drops manifest slugs whose folder no longer exists (dangling)", () => {
    const manifest = createMovieArrangement([
      { id: 1, scenes: ["a", "gone"] },
      { id: 2, scenes: ["b"] },
      { id: 3, scenes: [] },
    ]);
    const reconciled = reconcileArrangement(manifest, ["a", "b"]);
    expect(reconciled.scenesInAct(1)).toEqual(["a"]);
    expect(reconciled.linearSequence()).toEqual(["a", "b"]);
  });

  it("handles simultaneous append + drop and keeps existing act placement", () => {
    const manifest = createMovieArrangement([
      { id: 1, scenes: ["a", "gone"] },
      { id: 2, scenes: ["b"] },
      { id: 3, scenes: ["c"] },
    ]);
    // folders: a, b, c still present; 'gone' removed; 'new' added.
    const reconciled = reconcileArrangement(manifest, ["a", "b", "c", "new"]);
    expect(reconciled.scenesInAct(1)).toEqual(["a", "new"]);
    expect(reconciled.scenesInAct(2)).toEqual(["b"]);
    expect(reconciled.scenesInAct(3)).toEqual(["c"]);
  });

  it("is a no-op when manifest and folders already agree", () => {
    const manifest = createMovieArrangement([
      { id: 1, scenes: ["a"] },
      { id: 2, scenes: ["b"] },
      { id: 3, scenes: ["c"] },
    ]);
    const reconciled = reconcileArrangement(manifest, ["c", "a", "b"]);
    expect(reconciled.scenesInAct(1)).toEqual(["a"]);
    expect(reconciled.scenesInAct(2)).toEqual(["b"]);
    expect(reconciled.scenesInAct(3)).toEqual(["c"]);
  });
});
