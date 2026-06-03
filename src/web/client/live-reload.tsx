/**
 * Live-reload — listens to the server's `/api/events` SSE stream and triggers
 * a refetch of `/api/movie` when the server announces an external change.
 *
 * Why SSE (Slice 9 in-flight decision):
 *   - One-way server→client matches our needs; mutations go through the
 *     existing POST/PUT handlers.
 *   - EventSource gives auto-reconnect for free (~3s default). No client lib
 *     needed.
 *
 * Dirty-form protection (in-flight decision):
 *   - If any editor in the page is "open" (slugline, screenplay, or shot-meta
 *     editor mode is active), we defer the refresh and show a non-blocking
 *     toast: "다른 곳에서 변경됨". The toast offers a manual reload button.
 *   - Editors register themselves via `useEditorDirty(open)` so the policy is
 *     opt-in per-component.
 *   - "Open" rather than "draft !== source" because the existing editors all
 *     have a clear "I am in edit mode" boolean already; threading per-form
 *     draft state through every editor would have been touched 10+ files.
 *
 * The deferral state machine itself lives in `dirty-refresh-coordinator.ts`
 * (pure, unit-tested). This file is the React shell.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  createDirtyRefreshCoordinator,
  type DirtyRefreshCoordinator,
} from "./dirty-refresh-coordinator.js";

interface LiveReloadContextValue {
  /** Components that opt into dirty protection call register() and call the
   * returned function to unregister. */
  register(): () => void;
  /** True while an external refresh is being deferred. */
  pending: boolean;
  /** Manually force a refresh (used by the toast's "지금 새로고침" button). */
  forceRefresh(): void;
}

const LiveReloadContext = createContext<LiveReloadContextValue | null>(null);

export interface LiveReloadProviderProps {
  /** Refetch /api/movie. Called when SSE says refresh and no editors are open. */
  refresh(): void;
  children: ReactNode;
  /**
   * SSE URL. Overridable for tests. Default `/api/events`.
   */
  eventsUrl?: string;
  /**
   * Constructor for EventSource — overridable for tests so we can inject a
   * fake. Default uses globalThis.EventSource.
   */
  eventSourceFactory?: (url: string) => EventSourceLike;
}

/**
 * Minimum shape of EventSource used by this module. EventSource itself
 * implements this; tests can pass a fake.
 */
export interface EventSourceLike {
  addEventListener(
    type: string,
    listener: (ev: MessageEvent | Event) => void,
  ): void;
  close(): void;
  onerror?: ((ev: Event) => void) | null;
}

export function LiveReloadProvider({
  refresh,
  children,
  eventsUrl = "/api/events",
  eventSourceFactory,
}: LiveReloadProviderProps) {
  // Keep refresh in a ref so reconfiguring the SSE subscription doesn't churn
  // on every re-render of the host component.
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  const [pending, setPending] = useState(false);

  // The coordinator is stable for the lifetime of the provider — capturing
  // a fresh closure each render would reset the open-count state.
  const coordinator: DirtyRefreshCoordinator = useMemo(
    () =>
      createDirtyRefreshCoordinator({
        refresh: () => refreshRef.current(),
        onPendingChanged: (next) => setPending(next),
      }),
    [],
  );

  const register = useCallback(
    (): (() => void) => coordinator.registerOpen(),
    [coordinator],
  );

  const forceRefresh = useCallback(
    (): void => coordinator.forceRefresh(),
    [coordinator],
  );

  useEffect(() => {
    const ctor =
      eventSourceFactory ??
      ((url: string) =>
        new (
          globalThis as { EventSource: new (u: string) => EventSourceLike }
        ).EventSource(url));
    let source: EventSourceLike;
    try {
      source = ctor(eventsUrl);
    } catch (err) {
      // Browsers without EventSource or test envs without it — fail open:
      // app keeps working without auto-reload.
      console.error("[live-reload] EventSource unavailable:", err);
      return;
    }
    function onRefresh(): void {
      coordinator.requestRefresh();
    }
    function onReloadFailed(ev: MessageEvent | Event): void {
      const data = "data" in ev ? (ev as MessageEvent).data : "";
      console.warn("[live-reload] server reported reload-failed:", data);
      // Don't refresh on reload-failed — the server kept the previous
      // project so /api/movie is still consistent with what we already
      // have. Logging only.
    }
    function onError(_ev: Event): void {
      // EventSource auto-reconnects. No action needed.
    }
    source.addEventListener("refresh", onRefresh);
    source.addEventListener("reload-failed", onReloadFailed);
    if ("onerror" in source) source.onerror = onError;
    return () => source.close();
  }, [eventsUrl, eventSourceFactory, coordinator]);

  return (
    <LiveReloadContext.Provider value={{ register, pending, forceRefresh }}>
      {children}
    </LiveReloadContext.Provider>
  );
}

/**
 * Register an editor as "open" so external refreshes are deferred until the
 * editor closes. Outside a `<LiveReloadProvider>` this is a no-op so tests /
 * Storybook can mount editors without the provider.
 */
export function useEditorDirty(open: boolean): void {
  const ctx = useContext(LiveReloadContext);
  useEffect(() => {
    if (!ctx || !open) return;
    return ctx.register();
  }, [ctx, open]);
}

/**
 * Read the current pending/forceRefresh state for the deferred-refresh toast.
 * Returns null outside a provider (toast renders nothing).
 */
export function useLiveReloadStatus(): {
  pending: boolean;
  forceRefresh(): void;
} | null {
  const ctx = useContext(LiveReloadContext);
  if (!ctx) return null;
  return { pending: ctx.pending, forceRefresh: ctx.forceRefresh };
}
