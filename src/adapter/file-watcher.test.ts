/**
 * FileWatcher integration tests — real fs + temp dir.
 *
 * The watcher's job: detect data/ tree changes (create/modify/delete) and
 * coalesce bursts via debounce so a single user-action triggers one onChange,
 * not N. Watcher errors must not crash the host (they're surfaced via the
 * onError callback instead).
 *
 * Tests use real chokidar against a temp directory. Each test creates its own
 * data dir + tears down the watcher at the end so they're independent.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  mkdir,
  mkdtemp,
  rm,
  rmdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startFileWatcher, type FileWatcher } from "./file-watcher.js";

// Polling timing: chokidar's default ready cycle is ~30ms. We give generous
// margin so tests are stable on slower CI runners.
const DEBOUNCE_MS = 50;
const WAIT_AFTER_CHANGE_MS = 300;

async function wait(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

describe("FileWatcher", () => {
  let tmpDir: string;
  let dataDir: string;
  let watcher: FileWatcher | null = null;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "moviegen-watcher-"));
    dataDir = path.join(tmpDir, "data");
    await mkdir(path.join(dataDir, "scenes", "s01-test"), { recursive: true });
    await writeFile(
      path.join(dataDir, "scenes", "s01-test", "scene.yaml"),
      "slugline: TEST\nisStarred: false\n",
      "utf8",
    );
    await writeFile(
      path.join(dataDir, "scenes", "s01-test", "screenplay.md"),
      "# Test\n",
      "utf8",
    );
    watcher = null;
  });

  afterEach(async () => {
    if (watcher) {
      await watcher.stop();
      watcher = null;
    }
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("invokes onChange when a watched file is modified", async () => {
    const events: string[] = [];
    watcher = await startFileWatcher(dataDir, () => events.push("change"), {
      debounceMs: DEBOUNCE_MS,
    });

    await writeFile(
      path.join(dataDir, "scenes", "s01-test", "screenplay.md"),
      "# Modified\n",
      "utf8",
    );
    await wait(WAIT_AFTER_CHANGE_MS);

    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it("invokes onChange when a new file is created", async () => {
    const events: string[] = [];
    watcher = await startFileWatcher(dataDir, () => events.push("change"), {
      debounceMs: DEBOUNCE_MS,
    });

    await writeFile(
      path.join(dataDir, "scenes", "s01-test", "shots.yaml"),
      "shots: []\n",
      "utf8",
    );
    await wait(WAIT_AFTER_CHANGE_MS);

    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it("invokes onChange when a file is deleted", async () => {
    const target = path.join(dataDir, "scenes", "s01-test", "screenplay.md");
    const events: string[] = [];
    watcher = await startFileWatcher(dataDir, () => events.push("change"), {
      debounceMs: DEBOUNCE_MS,
    });

    await unlink(target);
    await wait(WAIT_AFTER_CHANGE_MS);

    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it("debounces bursts of changes into a single onChange call", async () => {
    const events: number[] = [];
    watcher = await startFileWatcher(dataDir, () => events.push(Date.now()), {
      debounceMs: 150,
    });

    // Five quick writes within the debounce window.
    const target = path.join(dataDir, "scenes", "s01-test", "screenplay.md");
    for (let i = 0; i < 5; i++) {
      await writeFile(target, `# burst ${i}\n`, "utf8");
      await wait(15);
    }
    await wait(500);

    // Single coalesced event expected. Allowing 1-2 to account for OS quirks
    // where chokidar may emit a flurry that splits across the debounce edge.
    expect(events.length).toBeLessThanOrEqual(2);
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it("detects changes in nested subdirectories (recursive)", async () => {
    const events: string[] = [];
    watcher = await startFileWatcher(dataDir, () => events.push("change"), {
      debounceMs: DEBOUNCE_MS,
    });

    await mkdir(path.join(dataDir, "characters"), { recursive: true });
    await writeFile(
      path.join(dataDir, "characters", "hero.yaml"),
      "name: hero\nheadshot: null\nlooks: []\n",
      "utf8",
    );
    await wait(WAIT_AFTER_CHANGE_MS);

    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it("stop() halts further onChange invocations", async () => {
    const events: string[] = [];
    watcher = await startFileWatcher(dataDir, () => events.push("change"), {
      debounceMs: DEBOUNCE_MS,
    });
    await watcher.stop();
    watcher = null; // skip afterEach stop

    await writeFile(
      path.join(dataDir, "scenes", "s01-test", "screenplay.md"),
      "# after stop\n",
      "utf8",
    );
    await wait(WAIT_AFTER_CHANGE_MS);

    expect(events).toEqual([]);
  });

  it("does not fire onChange for the initial scan of existing files", async () => {
    // Important: we don't want to reload the project on boot just because the
    // watcher saw the data dir; the boot path already loaded it. chokidar's
    // ignoreInitial:true gives us this guarantee.
    const events: string[] = [];
    watcher = await startFileWatcher(dataDir, () => events.push("change"), {
      debounceMs: DEBOUNCE_MS,
    });
    await wait(200);
    expect(events).toEqual([]);
  });

  it("survives an onChange callback that throws (does not crash watcher)", async () => {
    let okCallCount = 0;
    watcher = await startFileWatcher(
      dataDir,
      () => {
        okCallCount++;
        if (okCallCount === 1) throw new Error("simulated handler error");
      },
      { debounceMs: DEBOUNCE_MS },
    );

    await writeFile(
      path.join(dataDir, "scenes", "s01-test", "screenplay.md"),
      "# first\n",
      "utf8",
    );
    await wait(WAIT_AFTER_CHANGE_MS);
    await writeFile(
      path.join(dataDir, "scenes", "s01-test", "screenplay.md"),
      "# second\n",
      "utf8",
    );
    await wait(WAIT_AFTER_CHANGE_MS);

    // Second call should fire even after the first threw.
    expect(okCallCount).toBeGreaterThanOrEqual(2);
  });
});
