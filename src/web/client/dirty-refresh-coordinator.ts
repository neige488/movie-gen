/**
 * DirtyRefreshCoordinator — small framework-free state machine that decides
 * whether an incoming "external change detected" signal should refetch
 * immediately or be deferred until the user closes their open editors.
 *
 * Pulled out of live-reload.tsx so the deferral policy is unit-testable
 * without a React renderer. The React layer just observes `onPendingChanged`
 * for re-renders and wires up the `registerOpen` / `requestRefresh` calls.
 *
 * The state is:
 *   - openCount: how many editors are currently open
 *   - pending:   true iff a refresh was requested but withheld due to open
 *                editors
 *
 * Transitions:
 *   requestRefresh:
 *     openCount === 0 → call refresh immediately (pending stays false)
 *     openCount  >  0 → set pending=true
 *   registerOpen → returns unregister:
 *     unregister:
 *       openCount drops by 1
 *       if openCount === 0 && pending → call refresh, clear pending
 *   forceRefresh:
 *     call refresh, clear pending (used by the "지금 새로고침" toast button)
 */

export interface DirtyRefreshCoordinator {
  /** Register an open editor. Returns the unregister function. */
  registerOpen(): () => void;
  /** External refresh signal arrived. */
  requestRefresh(): void;
  /** Force refresh regardless of open editors. */
  forceRefresh(): void;
  /** Whether a refresh is currently waiting on open editors. */
  isPending(): boolean;
}

export interface DirtyRefreshCoordinatorOptions {
  /** Refetch /api/movie (or whatever the host wants done on refresh). */
  refresh(): void;
  /** Notified when the pending flag flips, so the UI can re-render. */
  onPendingChanged?(pending: boolean): void;
}

export function createDirtyRefreshCoordinator(
  options: DirtyRefreshCoordinatorOptions,
): DirtyRefreshCoordinator {
  let openCount = 0;
  let pending = false;
  const { refresh, onPendingChanged } = options;

  function setPending(next: boolean): void {
    if (pending === next) return;
    pending = next;
    onPendingChanged?.(pending);
  }

  function fireRefresh(): void {
    setPending(false);
    refresh();
  }

  return {
    registerOpen(): () => void {
      openCount += 1;
      let released = false;
      return () => {
        if (released) return; // idempotent — defend against double-unregister
        released = true;
        openCount = Math.max(0, openCount - 1);
        if (openCount === 0 && pending) {
          fireRefresh();
        }
      };
    },
    requestRefresh(): void {
      if (openCount === 0) {
        // Note: don't go through setPending(true) → setPending(false). Skip
        // the round-trip so onPendingChanged sees a clean run.
        refresh();
        return;
      }
      setPending(true);
    },
    forceRefresh(): void {
      fireRefresh();
    },
    isPending(): boolean {
      return pending;
    },
  };
}
