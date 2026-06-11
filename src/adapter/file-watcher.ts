/**
 * FileWatcher — watches `data/` for create/modify/delete and emits a single
 * coalesced onChange after a debounce window.
 *
 * Why chokidar (Slice 9 In-flight decision):
 *   - `node:fs.watch({recursive:true})` lacks Linux support before Node 20 and
 *     still has long-standing edge cases (missed events on rapid renames,
 *     duplicate events on macOS). chokidar normalizes platform quirks and is
 *     the de-facto standard (Vite, webpack, tsx all depend on it).
 *   - Single new dependency, well-maintained, ~50KB.
 *
 * Why a debounce wrapper (not chokidar's awaitWriteFinish):
 *   - The downstream action is "reload the entire Project", which is heavy.
 *     We want **at most one reload** per burst regardless of how many files
 *     changed. awaitWriteFinish only stabilizes individual files; we still
 *     need coalescing across files.
 *   - debounceMs=200ms by default. Empirically that's long enough to absorb
 *     "save in Claude Code → write 3 yaml files" bursts and short enough that
 *     users perceive the reload as instant.
 *
 * Interface stays small: start → handle to stop. Caller owns the onChange
 * callback (where the actual reload happens). Errors inside onChange are
 * caught here so a downstream throw does NOT kill the watcher (graceful
 * degradation per AC).
 */

import chokidar, { type FSWatcher } from "chokidar";

export interface FileWatcher {
  stop(): Promise<void>;
}

export interface FileWatcherOptions {
  /** Debounce window in milliseconds. Default 200ms. */
  debounceMs?: number;
  /**
   * Optional error sink. Called when chokidar emits an `error` event. The
   * watcher continues running — this is just a notification channel so the
   * server can log without crashing.
   */
  onError?: (err: Error) => void;
}

const DEFAULT_DEBOUNCE_MS = 200;

/**
 * Start a watcher on `rootDir`. Resolves once chokidar has finished its
 * initial scan (so the caller knows changes from this point onward will
 * trigger onChange). The watcher uses `ignoreInitial: true` to suppress
 * onChange firing for files that already exist at start.
 */
export async function startFileWatcher(
  rootDir: string,
  onChange: () => void,
  options: FileWatcherOptions = {},
): Promise<FileWatcher> {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const onError = options.onError ?? defaultErrorLogger;

  const watcher: FSWatcher = chokidar.watch(rootDir, {
    ignoreInitial: true,
    // Atomic writes (Claude Code, editors) often create a temp file and rename
    // over the target. atomic:true tells chokidar to wait briefly for these
    // sequences and emit a single `change` instead of unlink+add.
    atomic: true,
    // Persistent so the watcher keeps the event loop alive while the server
    // runs. Stopped explicitly via stop().
    persistent: true,
  });

  let debounceTimer: NodeJS.Timeout | null = null;

  function fireDebounced(): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      try {
        onChange();
      } catch (err) {
        // Swallow + report. A throw in user code must NOT take down the
        // watcher loop.
        onError(err instanceof Error ? err : new Error(String(err)));
      }
    }, debounceMs);
  }

  watcher.on("add", fireDebounced);
  watcher.on("change", fireDebounced);
  watcher.on("unlink", fireDebounced);
  watcher.on("addDir", fireDebounced);
  watcher.on("unlinkDir", fireDebounced);
  watcher.on("error", (err: unknown) => {
    onError(err instanceof Error ? err : new Error(String(err)));
  });

  // Wait until chokidar has scanned the existing tree. This is what
  // distinguishes the "initial" phase from the live phase — after `ready`,
  // every event maps to a real filesystem mutation.
  await new Promise<void>((resolve) => {
    watcher.once("ready", () => resolve());
  });

  return {
    async stop(): Promise<void> {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      await watcher.close();
    },
  };
}

function defaultErrorLogger(err: Error): void {
  // The server's main.ts can override this; default is a console.error so the
  // problem doesn't vanish silently.
  console.error("[file-watcher]", err.message);
}
