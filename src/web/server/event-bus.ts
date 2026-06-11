/**
 * EventBus — in-process pub/sub for reload events.
 *
 * The file watcher publishes events here; the SSE handler subscribes one
 * listener per connected client and translates events to the wire format.
 *
 * Design:
 *   - No replay buffer. Clients that reconnect after a transient drop get the
 *     next event, not past ones. The director will refetch /api/movie when
 *     they reconnect anyway (EventSource handles reconnect automatically).
 *   - Per-subscriber try/catch — a throwing listener must not poison the
 *     remaining fan-out. SSE writes can throw on disconnected sockets and we
 *     don't want one stale connection to block live ones.
 *   - Synchronous publish — keep semantics simple. SSE writes are
 *     non-blocking (Node buffers them).
 */

export type ReloadEvent =
  | { kind: "refresh" }
  | { kind: "reload-failed"; message: string };

export type ReloadEventListener = (event: ReloadEvent) => void;

export interface EventBus {
  subscribe(listener: ReloadEventListener): () => void;
  publish(event: ReloadEvent): void;
  subscriberCount(): number;
}

export function createEventBus(): EventBus {
  // Use a Set so unsubscribe is O(1) and we tolerate the rare case where the
  // same function reference is registered twice (handled by Set identity).
  const listeners = new Set<ReloadEventListener>();

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    publish(event) {
      // Snapshot to a list so a listener that unsubscribes itself during
      // delivery does not skip the next listener in iteration order.
      const snapshot = [...listeners];
      for (const l of snapshot) {
        try {
          l(event);
        } catch (err) {
          // A listener throwing must not block others. Log + continue.
          // We use console.error directly here (not a fancy logger) because
          // the event bus is meant to be infrastructure-thin.
          console.error(
            "[event-bus] subscriber threw:",
            (err as Error)?.message ?? err,
          );
        }
      }
    },
    subscriberCount() {
      return listeners.size;
    },
  };
}
