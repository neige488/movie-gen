/**
 * Acknowledge actions — RED tests for `acknowledgeShot` / `acknowledgeTake`.
 *
 * Per CONTEXT.md "Sync via hash, not auto-decision": directors hit "Shot
 * 확인됨" / "Take 확인됨" to refresh the stored `screenplayHash` snapshot
 * after a small screenplay edit. The Take stays immutable on every other
 * field (videoPath, createdAt, isStarred).
 *
 * Behavior verified through public interface only — refactor-safe.
 */
import { describe, expect, it } from "vitest";
import {
  acknowledgeShot,
  acknowledgeTake,
  createProject,
  createScene,
  createShot,
  createTake,
  DomainInvariantError,
} from "./movie.js";
import { computeScreenplayHash } from "./hash-calculator.js";

const HASH_OLD = computeScreenplayHash("old body");
const HASH_NEW = computeScreenplayHash("new body");

const screenplayNew = [
  "<!-- shot:01 -->",
  "new body",
  "<!-- /shot:01 -->",
].join("\n");

const screenplayNewMultiShot = [
  "<!-- shot:01 -->",
  "new body",
  "<!-- /shot:01 -->",
  "",
  "<!-- shot:02 -->",
  "other body",
  "<!-- /shot:02 -->",
].join("\n");

const mkScene = (screenplay: string, shots: ReturnType<typeof createShot>[]) =>
  createScene({
    slug: "s01",
    slugline: "INT. X - DAY",
    screenplay,
    isStarred: true,
    shots,
  });

const mkProject = (scene: ReturnType<typeof mkScene>) =>
  createProject({
    scenes: [scene],
    characters: [],
    locations: [],
    props: [],
  });

const mkShot = (id: string, hash: string, takes: ReturnType<typeof createTake>[] = []) =>
  createShot({
    id,
    prompt: "p",
    duration: 5,
    screenplayHash: hash,
    characterRefs: [],
    locationRefs: [],
    propRefs: [],
    takes,
  });

describe("acknowledgeShot", () => {
  it("updates the Shot.screenplayHash to the current marker block hash", () => {
    const project = mkProject(mkScene(screenplayNew, [mkShot("01", HASH_OLD)]));
    const next = acknowledgeShot(project, "s01", "01");
    expect(next.scenes[0]!.shots[0]!.screenplayHash).toBe(HASH_NEW);
  });

  it("leaves Take.screenplayHash untouched (Take is immutable)", () => {
    const oldTake = createTake({
      id: "t01",
      videoPath: "v.mp4",
      screenplayHash: HASH_OLD,
      createdAt: "2026-06-03T10:00:00.000Z",
    });
    const project = mkProject(
      mkScene(screenplayNew, [mkShot("01", HASH_OLD, [oldTake])]),
    );
    const next = acknowledgeShot(project, "s01", "01");
    expect(next.scenes[0]!.shots[0]!.takes[0]!.screenplayHash).toBe(HASH_OLD);
    expect(next.scenes[0]!.shots[0]!.takes[0]!.createdAt).toBe(
      "2026-06-03T10:00:00.000Z",
    );
  });

  it("returns a new Project (immutability of input)", () => {
    const project = mkProject(mkScene(screenplayNew, [mkShot("01", HASH_OLD)]));
    const next = acknowledgeShot(project, "s01", "01");
    expect(next).not.toBe(project);
    expect(project.scenes[0]!.shots[0]!.screenplayHash).toBe(HASH_OLD);
  });

  it("only touches the targeted Shot — siblings keep their hash", () => {
    const project = mkProject(
      mkScene(screenplayNewMultiShot, [
        mkShot("01", HASH_OLD),
        mkShot("02", "old-other"),
      ]),
    );
    const next = acknowledgeShot(project, "s01", "01");
    expect(next.scenes[0]!.shots[0]!.screenplayHash).toBe(HASH_NEW);
    expect(next.scenes[0]!.shots[1]!.screenplayHash).toBe("old-other");
  });

  it("throws if the Scene slug is unknown", () => {
    const project = mkProject(mkScene(screenplayNew, [mkShot("01", HASH_OLD)]));
    expect(() => acknowledgeShot(project, "ghost", "01")).toThrow(
      DomainInvariantError,
    );
  });

  it("throws if the Shot id is unknown in the Scene", () => {
    const project = mkProject(mkScene(screenplayNew, [mkShot("01", HASH_OLD)]));
    expect(() => acknowledgeShot(project, "s01", "99")).toThrow(
      DomainInvariantError,
    );
  });

  it("throws if the Shot has no matching marker block (orphan)", () => {
    const project = mkProject(
      mkScene("no markers here", [mkShot("01", HASH_OLD)]),
    );
    expect(() => acknowledgeShot(project, "s01", "01")).toThrow(
      DomainInvariantError,
    );
    expect(() => acknowledgeShot(project, "s01", "01")).toThrow(/orphan|marker/i);
  });
});

describe("acknowledgeTake", () => {
  it("updates Take.screenplayHash to the current marker block hash", () => {
    const oldTake = createTake({
      id: "t01",
      videoPath: "v.mp4",
      screenplayHash: HASH_OLD,
      createdAt: "2026-06-03T10:00:00.000Z",
    });
    const project = mkProject(
      mkScene(screenplayNew, [mkShot("01", HASH_NEW, [oldTake])]),
    );
    const next = acknowledgeTake(project, "s01", "01", "t01");
    expect(next.scenes[0]!.shots[0]!.takes[0]!.screenplayHash).toBe(HASH_NEW);
  });

  it("preserves Take immutable fields (videoPath, createdAt, isStarred)", () => {
    const oldTake = createTake({
      id: "t01",
      videoPath: "takes/s01/01-take01.mp4",
      screenplayHash: HASH_OLD,
      createdAt: "2026-06-03T10:00:00.000Z",
      isStarred: true,
    });
    const project = mkProject(
      mkScene(screenplayNew, [mkShot("01", HASH_NEW, [oldTake])]),
    );
    const next = acknowledgeTake(project, "s01", "01", "t01");
    const take = next.scenes[0]!.shots[0]!.takes[0]!;
    expect(take.id).toBe("t01");
    expect(take.videoPath).toBe("takes/s01/01-take01.mp4");
    expect(take.createdAt).toBe("2026-06-03T10:00:00.000Z");
    expect(take.isStarred).toBe(true);
  });

  it("leaves Shot.screenplayHash untouched (only the targeted Take changes)", () => {
    const t = createTake({
      id: "t01",
      videoPath: "v.mp4",
      screenplayHash: HASH_OLD,
      createdAt: "2026-06-03T10:00:00.000Z",
    });
    const project = mkProject(
      mkScene(screenplayNew, [mkShot("01", "shot-pinned-hash", [t])]),
    );
    const next = acknowledgeTake(project, "s01", "01", "t01");
    expect(next.scenes[0]!.shots[0]!.screenplayHash).toBe("shot-pinned-hash");
    expect(next.scenes[0]!.shots[0]!.takes[0]!.screenplayHash).toBe(HASH_NEW);
  });

  it("returns a new Project (immutability of input)", () => {
    const t = createTake({
      id: "t01",
      videoPath: "v.mp4",
      screenplayHash: HASH_OLD,
      createdAt: "2026-06-03T10:00:00.000Z",
    });
    const project = mkProject(
      mkScene(screenplayNew, [mkShot("01", HASH_NEW, [t])]),
    );
    const next = acknowledgeTake(project, "s01", "01", "t01");
    expect(next).not.toBe(project);
    expect(project.scenes[0]!.shots[0]!.takes[0]!.screenplayHash).toBe(HASH_OLD);
  });

  it("only touches the targeted Take — sibling takes keep their hash", () => {
    const t1 = createTake({
      id: "t01",
      videoPath: "a.mp4",
      screenplayHash: HASH_OLD,
      createdAt: "2026-06-03T10:00:00.000Z",
    });
    const t2 = createTake({
      id: "t02",
      videoPath: "b.mp4",
      screenplayHash: "another-old-hash",
      createdAt: "2026-06-03T10:01:00.000Z",
    });
    const project = mkProject(
      mkScene(screenplayNew, [mkShot("01", HASH_NEW, [t1, t2])]),
    );
    const next = acknowledgeTake(project, "s01", "01", "t01");
    const takes = next.scenes[0]!.shots[0]!.takes;
    expect(takes[0]!.screenplayHash).toBe(HASH_NEW);
    expect(takes[1]!.screenplayHash).toBe("another-old-hash");
  });

  it("throws if Scene slug unknown", () => {
    const t = createTake({
      id: "t01",
      videoPath: "v.mp4",
      screenplayHash: HASH_OLD,
      createdAt: "2026-06-03T10:00:00.000Z",
    });
    const project = mkProject(
      mkScene(screenplayNew, [mkShot("01", HASH_NEW, [t])]),
    );
    expect(() => acknowledgeTake(project, "ghost", "01", "t01")).toThrow(
      DomainInvariantError,
    );
  });

  it("throws if Shot id unknown", () => {
    const t = createTake({
      id: "t01",
      videoPath: "v.mp4",
      screenplayHash: HASH_OLD,
      createdAt: "2026-06-03T10:00:00.000Z",
    });
    const project = mkProject(
      mkScene(screenplayNew, [mkShot("01", HASH_NEW, [t])]),
    );
    expect(() => acknowledgeTake(project, "s01", "99", "t01")).toThrow(
      DomainInvariantError,
    );
  });

  it("throws if Take id unknown", () => {
    const t = createTake({
      id: "t01",
      videoPath: "v.mp4",
      screenplayHash: HASH_OLD,
      createdAt: "2026-06-03T10:00:00.000Z",
    });
    const project = mkProject(
      mkScene(screenplayNew, [mkShot("01", HASH_NEW, [t])]),
    );
    expect(() => acknowledgeTake(project, "s01", "01", "t99")).toThrow(
      DomainInvariantError,
    );
  });

  it("throws if the Shot has no matching marker block (orphan — nothing to acknowledge)", () => {
    const t = createTake({
      id: "t01",
      videoPath: "v.mp4",
      screenplayHash: HASH_OLD,
      createdAt: "2026-06-03T10:00:00.000Z",
    });
    const project = mkProject(
      mkScene("no markers here", [mkShot("01", HASH_OLD, [t])]),
    );
    expect(() => acknowledgeTake(project, "s01", "01", "t01")).toThrow(
      DomainInvariantError,
    );
  });
});
