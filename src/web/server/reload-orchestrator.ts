/**
 * ReloadOrchestrator — runs loadProject in response to file watcher triggers
 * and atomically swaps the in-memory Project, publishing the outcome on the
 * EventBus.
 *
 * Why a separate module:
 *   - main.ts already does ~20 things. Pulling the reload state machine into
 *     its own module keeps main.ts to plumbing.
 *   - The "no parallel loads" + "queue at most one follow-up" rule is a real
 *     piece of logic worth its own tests.
 *
 * State machine:
 *   - idle: no load in flight, no pending. reload() starts a load.
 *   - loading: a load is in flight. reload() marks pending=true.
 *   - loading + pending: same as loading. additional reload() calls are
 *     ignored (already pending).
 *   - When the load resolves (success or failure), if pending was set, clear
 *     it and start the next load. This guarantees:
 *       * at most one in-flight load
 *       * the system eventually catches up to the latest file state
 *         (because the LAST event that came in during the busy period is
 *         honored by the follow-up)
 *
 * Atomic swap:
 *   - We `await` loadProject in full before calling setProject. If it throws,
 *     the previous project is preserved. There's no torn state — domain
 *     consumers reading currentProject always see a fully-validated project.
 */

import type { Project } from "@domain/movie.js";
import type { EventBus } from "./event-bus.js";

export interface ReloadOrchestrator {
  /**
   * Trigger a reload. Returns a promise that resolves when this trigger's
   * effect (or its queued follow-up) has settled, so tests + the boot path
   * can wait deterministically. In production the file watcher calls this
   * without awaiting — the side effects (project swap + bus event) are what
   * matter.
   */
  reload(): Promise<void>;
}

export interface ReloadOrchestratorDeps {
  /** Source of truth for the project tree (boundary to filesystem). */
  loadProject: () => Promise<Project>;
  /** Read the current in-memory project (used only for error context today). */
  getProject: () => Project;
  /** Swap the in-memory project to the new one. */
  setProject: (p: Project) => void;
  /** Where to publish refresh / reload-failed events. */
  bus: EventBus;
}

export function createReloadOrchestrator(
  deps: ReloadOrchestratorDeps,
): ReloadOrchestrator {
  let loading = false;
  let pending = false;
  // The current in-flight promise — returned to additional reload() callers
  // so they can `await` the eventual completion (including any follow-up).
  let currentPromise: Promise<void> | null = null;

  async function runLoad(): Promise<void> {
    do {
      pending = false;
      try {
        const next = await deps.loadProject();
        deps.setProject(next);
        deps.bus.publish({ kind: "refresh" });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : String(err);
        deps.bus.publish({ kind: "reload-failed", message });
      }
      // Loop while another reload was requested during the last cycle.
    } while (pending);
  }

  return {
    reload(): Promise<void> {
      if (loading) {
        pending = true;
        // Subsequent callers await the same in-flight promise (which itself
        // will spin once more if pending is still set when the body finishes).
        return currentPromise ?? Promise.resolve();
      }
      loading = true;
      currentPromise = runLoad().finally(() => {
        loading = false;
        currentPromise = null;
      });
      return currentPromise;
    },
  };
}
