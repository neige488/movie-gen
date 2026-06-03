/**
 * AssetStore — integration tests against a real temp filesystem.
 *
 * The store is the only writer to `assets/`. It:
 *  - Decides the on-disk path from a domain-typed slot identifier.
 *  - Auto-creates parent directories.
 *  - Handles filename collisions by appending `-2`, `-3` ... before extension.
 *  - Refuses path-traversal attempts (`..`, absolute paths, slashes in names).
 *  - Returns the *relative path* recorded in YAML (no `assets/` prefix —
 *    paths are relative to the assets root, matching existing fixture style:
 *    e.g. `character-a/introspective/face-front.png`).
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  createAssetStore,
  AssetStoreError,
  type AssetStore,
  type AssetSlot,
} from "./asset-store.js";

let assetsDir: string;
let store: AssetStore;

beforeEach(() => {
  assetsDir = mkdtempSync(path.join(tmpdir(), "moviegen-assets-"));
  store = createAssetStore(assetsDir);
});

afterEach(() => {
  rmSync(assetsDir, { recursive: true, force: true });
});

function bytes(content: string): Buffer {
  return Buffer.from(content, "utf8");
}

describe("AssetStore.upload — character headshot", () => {
  it("writes file under assets/characters/{name}/headshot.{ext} and returns relative path", async () => {
    const slot: AssetSlot = {
      kind: "character-headshot",
      character: "alice",
    };

    const rel = await store.upload(slot, "raw.png", bytes("PNG-DATA"));

    expect(rel).toBe("characters/alice/headshot.png");
    const onDisk = path.join(assetsDir, rel);
    expect(existsSync(onDisk)).toBe(true);
    expect(readFileSync(onDisk, "utf8")).toBe("PNG-DATA");
  });

  it("auto-creates nested directories", async () => {
    const slot: AssetSlot = {
      kind: "character-headshot",
      character: "bravo-mike",
    };
    await store.upload(slot, "x.jpg", bytes("X"));
    expect(existsSync(path.join(assetsDir, "characters/bravo-mike"))).toBe(
      true,
    );
  });

  it("preserves uploaded extension (case-normalized lowercase)", async () => {
    const slot: AssetSlot = {
      kind: "character-headshot",
      character: "alice",
    };
    const rel = await store.upload(slot, "head.JPG", bytes("J"));
    expect(rel).toBe("characters/alice/headshot.jpg");
  });
});

describe("AssetStore.upload — look face/body slots", () => {
  it("face slot writes the single 5-panel sheet to face.{ext}", async () => {
    const rel = await store.upload(
      { kind: "character-face", character: "alice", look: "hoodie" },
      "f.png",
      bytes("F"),
    );
    expect(rel).toBe("characters/alice/hoodie/face.png");
  });

  it("body slot writes the single 3-panel sheet to body.{ext}", async () => {
    const rel = await store.upload(
      { kind: "character-body", character: "alice", look: "hoodie" },
      "b.png",
      bytes("B"),
    );
    expect(rel).toBe("characters/alice/hoodie/body.png");
  });

  it("rejects a look name with path traversal", async () => {
    await expect(
      store.upload(
        { kind: "character-face", character: "alice", look: "../escape" },
        "f.png",
        bytes("F"),
      ),
    ).rejects.toThrow(AssetStoreError);
  });
});

describe("AssetStore.upload — location / prop reference", () => {
  it("location ref writes to locations/{name}/{refName}.{ext}", async () => {
    const rel = await store.upload(
      { kind: "location-ref", location: "riverside", refName: "misty-bank" },
      "shot.png",
      bytes("L"),
    );
    expect(rel).toBe("locations/riverside/misty-bank.png");
  });

  it("prop ref writes to props/{name}/{refName}.{ext}", async () => {
    const rel = await store.upload(
      { kind: "prop-ref", prop: "notebook", refName: "closed" },
      "p.png",
      bytes("P"),
    );
    expect(rel).toBe("props/notebook/closed.png");
  });
});

describe("AssetStore.upload — take video", () => {
  it("writes video under videos/scenes/{scene}/shots/{shot}/takes/{takeId}.{ext}", async () => {
    const rel = await store.upload(
      {
        kind: "take-video",
        sceneSlug: "s01-prologue",
        shotId: "01",
        takeId: "take-001",
      },
      "raw.mp4",
      bytes("MP4-DATA"),
    );
    expect(rel).toBe(
      "videos/scenes/s01-prologue/shots/01/takes/take-001.mp4",
    );
    const onDisk = path.join(assetsDir, rel);
    expect(existsSync(onDisk)).toBe(true);
    expect(readFileSync(onDisk, "utf8")).toBe("MP4-DATA");
  });

  it("accepts webm and mov extensions", async () => {
    const r1 = await store.upload(
      {
        kind: "take-video",
        sceneSlug: "s01",
        shotId: "01",
        takeId: "take-001",
      },
      "v.webm",
      bytes("W"),
    );
    expect(r1).toBe("videos/scenes/s01/shots/01/takes/take-001.webm");
    const r2 = await store.upload(
      {
        kind: "take-video",
        sceneSlug: "s01",
        shotId: "01",
        takeId: "take-002",
      },
      "v.mov",
      bytes("M"),
    );
    expect(r2).toBe("videos/scenes/s01/shots/01/takes/take-002.mov");
  });

  it("rejects unsupported video extension (e.g. .exe)", async () => {
    await expect(
      store.upload(
        {
          kind: "take-video",
          sceneSlug: "s01",
          shotId: "01",
          takeId: "take-001",
        },
        "evil.exe",
        bytes("E"),
      ),
    ).rejects.toThrow(AssetStoreError);
  });

  it("rejects image-only extension (.png) for take video", async () => {
    // png is allowed for image slots but not for take-video — preserve the
    // distinction so callers do not accidentally upload images as takes.
    await expect(
      store.upload(
        {
          kind: "take-video",
          sceneSlug: "s01",
          shotId: "01",
          takeId: "take-001",
        },
        "not-a-video.png",
        bytes("P"),
      ),
    ).rejects.toThrow(AssetStoreError);
  });

  it("rejects scene slug or shot id with path traversal", async () => {
    await expect(
      store.upload(
        {
          kind: "take-video",
          sceneSlug: "../etc",
          shotId: "01",
          takeId: "take-001",
        },
        "x.mp4",
        bytes("X"),
      ),
    ).rejects.toThrow(AssetStoreError);
    await expect(
      store.upload(
        {
          kind: "take-video",
          sceneSlug: "s01",
          shotId: "01/02",
          takeId: "take-001",
        },
        "x.mp4",
        bytes("X"),
      ),
    ).rejects.toThrow(AssetStoreError);
    await expect(
      store.upload(
        {
          kind: "take-video",
          sceneSlug: "s01",
          shotId: "01",
          takeId: "../take",
        },
        "x.mp4",
        bytes("X"),
      ),
    ).rejects.toThrow(AssetStoreError);
  });
});

describe("AssetStore.upload — collision handling", () => {
  it("appends -2, -3 suffix when target exists", async () => {
    const slot: AssetSlot = {
      kind: "character-headshot",
      character: "alice",
    };
    const r1 = await store.upload(slot, "a.png", bytes("v1"));
    const r2 = await store.upload(slot, "a.png", bytes("v2"));
    const r3 = await store.upload(slot, "a.png", bytes("v3"));

    expect(r1).toBe("characters/alice/headshot.png");
    expect(r2).toBe("characters/alice/headshot-2.png");
    expect(r3).toBe("characters/alice/headshot-3.png");

    // No file was overwritten.
    expect(readFileSync(path.join(assetsDir, r1), "utf8")).toBe("v1");
    expect(readFileSync(path.join(assetsDir, r2), "utf8")).toBe("v2");
    expect(readFileSync(path.join(assetsDir, r3), "utf8")).toBe("v3");
  });
});

describe("AssetStore.resolve — security", () => {
  it("returns absolute path within assets root for legal relative path", () => {
    const abs = store.resolve("characters/alice/headshot.png");
    expect(path.isAbsolute(abs)).toBe(true);
    expect(abs.startsWith(assetsDir + path.sep) || abs === assetsDir).toBe(
      true,
    );
  });

  it("rejects path-traversal via ..", () => {
    expect(() => store.resolve("../etc/passwd")).toThrow(AssetStoreError);
    expect(() => store.resolve("characters/../../secret")).toThrow(
      AssetStoreError,
    );
  });

  it("rejects absolute paths", () => {
    expect(() => store.resolve("/etc/passwd")).toThrow(AssetStoreError);
  });
});

describe("AssetStore.upload — input hygiene", () => {
  it("rejects character names containing path separators or ..", async () => {
    await expect(
      store.upload(
        { kind: "character-headshot", character: "../etc" },
        "x.png",
        bytes("X"),
      ),
    ).rejects.toThrow(AssetStoreError);
    await expect(
      store.upload(
        { kind: "character-headshot", character: "alice/bob" },
        "x.png",
        bytes("X"),
      ),
    ).rejects.toThrow(AssetStoreError);
  });

  it("rejects upload with unsupported extension", async () => {
    await expect(
      store.upload(
        { kind: "character-headshot", character: "alice" },
        "evil.exe",
        bytes("E"),
      ),
    ).rejects.toThrow(AssetStoreError);
  });

  it("falls back to .png when filename has no extension", async () => {
    const rel = await store.upload(
      { kind: "character-headshot", character: "alice" },
      "blob",
      bytes("B"),
    );
    expect(rel).toBe("characters/alice/headshot.png");
  });
});
