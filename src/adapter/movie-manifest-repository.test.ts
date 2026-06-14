import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import yaml from "js-yaml";
import {
  loadArrangement,
  saveArrangement,
  MovieManifestError,
} from "./movie-manifest-repository.js";
import { createMovieArrangement } from "@domain/movie-arrangement.js";

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "moviegen-manifest-test-"));
  mkdirSync(path.join(dataDir, "scenes"), { recursive: true });
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

function makeSceneFolder(slug: string): void {
  mkdirSync(path.join(dataDir, "scenes", slug), { recursive: true });
}

function writeManifest(text: string): void {
  writeFileSync(path.join(dataDir, "movie.yaml"), text);
}

function readManifest(): unknown {
  return yaml.load(readFileSync(path.join(dataDir, "movie.yaml"), "utf8"));
}

// ---------------------------------------------------------------------------
// Migration — manifest absent
// ---------------------------------------------------------------------------

describe("loadArrangement — migration (no manifest on disk)", () => {
  it("puts every scene folder into act 1 in folder-slug order", async () => {
    makeSceneFolder("s02-b");
    makeSceneFolder("s01-a");
    makeSceneFolder("s03-c");

    const arr = await loadArrangement(dataDir);
    // Migration order = sorted folder slugs (deterministic boot order).
    expect(arr.scenesInAct(1)).toEqual(["s01-a", "s02-b", "s03-c"]);
    expect(arr.scenesInAct(2)).toEqual([]);
    expect(arr.scenesInAct(3)).toEqual([]);
  });

  it("returns an empty 3-act arrangement when there are no scenes at all", async () => {
    const arr = await loadArrangement(dataDir);
    expect(arr.linearSequence()).toEqual([]);
  });

  it("does NOT write the manifest as a side effect of loading (load is read-only)", async () => {
    makeSceneFolder("s01-a");
    await loadArrangement(dataDir);
    expect(existsSync(path.join(dataDir, "movie.yaml"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Load existing manifest + reconcile
// ---------------------------------------------------------------------------

describe("loadArrangement — existing manifest + reconcile", () => {
  it("loads the manifest order verbatim when it agrees with folders", async () => {
    makeSceneFolder("s01-a");
    makeSceneFolder("s02-b");
    makeSceneFolder("s03-c");
    writeManifest(`
acts:
  - id: 1
    scenes: [s03-c]
  - id: 2
    scenes: [s01-a]
  - id: 3
    scenes: [s02-b]
`);
    const arr = await loadArrangement(dataDir);
    expect(arr.linearSequence()).toEqual(["s03-c", "s01-a", "s02-b"]);
  });

  it("appends a folder missing from the manifest to the end of act 1", async () => {
    makeSceneFolder("s01-a");
    makeSceneFolder("s02-b");
    makeSceneFolder("s03-new");
    writeManifest(`
acts:
  - id: 1
    scenes: [s01-a]
  - id: 2
    scenes: [s02-b]
  - id: 3
    scenes: []
`);
    const arr = await loadArrangement(dataDir);
    expect(arr.scenesInAct(1)).toEqual(["s01-a", "s03-new"]);
    expect(arr.scenesInAct(2)).toEqual(["s02-b"]);
  });

  it("drops a manifest slug whose folder no longer exists (dangling)", async () => {
    makeSceneFolder("s01-a");
    writeManifest(`
acts:
  - id: 1
    scenes: [s01-a, s99-gone]
  - id: 2
    scenes: []
  - id: 3
    scenes: []
`);
    const arr = await loadArrangement(dataDir);
    expect(arr.linearSequence()).toEqual(["s01-a"]);
  });
});

// ---------------------------------------------------------------------------
// save (atomic) + round-trip
// ---------------------------------------------------------------------------

describe("saveArrangement — round-trip & shape", () => {
  it("writes a manifest that loadArrangement reads back identically (round-trip)", async () => {
    makeSceneFolder("s01-a");
    makeSceneFolder("s02-b");
    makeSceneFolder("s03-c");
    const arrangement = createMovieArrangement([
      { id: 1, scenes: ["s02-b"] },
      { id: 2, scenes: ["s01-a"] },
      { id: 3, scenes: ["s03-c"] },
    ]);
    await saveArrangement(dataDir, arrangement);

    const reloaded = await loadArrangement(dataDir);
    expect(reloaded.scenesInAct(1)).toEqual(["s02-b"]);
    expect(reloaded.scenesInAct(2)).toEqual(["s01-a"]);
    expect(reloaded.scenesInAct(3)).toEqual(["s03-c"]);
  });

  it("serializes the canonical {acts:[{id,scenes}]} shape", async () => {
    const arrangement = createMovieArrangement([
      { id: 1, scenes: ["a"] },
      { id: 2, scenes: [] },
      { id: 3, scenes: [] },
    ]);
    await saveArrangement(dataDir, arrangement);
    const raw = readManifest() as {
      acts: { id: number; scenes: string[] }[];
    };
    expect(raw.acts).toHaveLength(3);
    expect(raw.acts[0]).toEqual({ id: 1, scenes: ["a"] });
    expect(raw.acts[1]).toEqual({ id: 2, scenes: [] });
    expect(raw.acts[2]).toEqual({ id: 3, scenes: [] });
  });

  it("leaves no temp file behind after an atomic write", async () => {
    const arrangement = createMovieArrangement([
      { id: 1, scenes: ["a"] },
      { id: 2, scenes: [] },
      { id: 3, scenes: [] },
    ]);
    await saveArrangement(dataDir, arrangement);
    const leftovers = readdirSync(dataDir).filter(
      (f) => f.includes("movie.yaml") && f !== "movie.yaml",
    );
    expect(leftovers).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// error reporting
// ---------------------------------------------------------------------------

describe("loadArrangement — error reporting", () => {
  it("throws MovieManifestError on malformed YAML", async () => {
    writeManifest(`acts: [unclosed`);
    await expect(loadArrangement(dataDir)).rejects.toThrow(MovieManifestError);
  });

  it("throws MovieManifestError when acts are not 1,2,3", async () => {
    makeSceneFolder("s01-a");
    writeManifest(`
acts:
  - id: 1
    scenes: [s01-a]
  - id: 2
    scenes: []
`);
    await expect(loadArrangement(dataDir)).rejects.toThrow(MovieManifestError);
  });

  it("throws MovieManifestError on a duplicate slug across acts", async () => {
    makeSceneFolder("dup");
    writeManifest(`
acts:
  - id: 1
    scenes: [dup]
  - id: 2
    scenes: [dup]
  - id: 3
    scenes: []
`);
    await expect(loadArrangement(dataDir)).rejects.toThrow(/duplicate/i);
  });
});
