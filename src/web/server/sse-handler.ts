/**
 * SSE handler — attaches `GET /api/events` to an Express app and translates
 * EventBus events into Server-Sent Events on the wire.
 *
 * Wire format per SSE spec:
 *     event: <kind>
 *     data: <json>
 *     <blank line>
 *
 * Why SSE (Slice 9 in-flight decision):
 *   - Single direction (server → client) matches the use case (the client
 *     pulls /api/movie when notified; mutations still go through POST/PUT
 *     handlers we already have).
 *   - Native browser support via EventSource — automatic reconnect with
 *     exponential backoff. No extra client lib.
 *   - Trivial to implement on top of Express response streams. No WebSocket
 *     upgrade dance, no separate port.
 *
 * Heartbeats:
 *   - Every 25s we write a comment line (`: keep-alive\n\n`). Proxies often
 *     terminate idle connections at 30-60s. The comment is invisible to
 *     EventSource (no event/data dispatched) but keeps the pipe open.
 *
 * Disconnect handling:
 *   - The unsubscribe handle is invoked from the response 'close' event so
 *     the EventBus subscriber set shrinks promptly.
 */

import type { Express, Request, Response } from "express";
import type { EventBus, ReloadEvent } from "./event-bus.js";

const HEARTBEAT_MS = 25_000;

export function attachSseHandler(app: Express, bus: EventBus): void {
  app.get("/api/events", (req: Request, res: Response) => {
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable Express's default ETag/compression for this stream.
      "X-Accel-Buffering": "no",
    });
    // Send headers immediately so EventSource transitions to OPEN.
    res.flushHeaders?.();

    // Write an initial comment so any reverse proxy that buffers until first
    // byte sees data right away.
    res.write(": connected\n\n");

    const unsubscribe = bus.subscribe((event: ReloadEvent) => {
      try {
        res.write(formatEvent(event));
      } catch {
        // If the socket is half-closed, the next 'close' will clean up.
      }
    });

    const heartbeat = setInterval(() => {
      try {
        res.write(": keep-alive\n\n");
      } catch {
        // ignore — close handler will tear down
      }
    }, HEARTBEAT_MS);
    // Don't hold the event loop open for the heartbeat alone.
    if (typeof heartbeat.unref === "function") heartbeat.unref();

    function teardown(): void {
      clearInterval(heartbeat);
      unsubscribe();
    }
    res.on("close", teardown);
    res.on("error", teardown);
    req.on("close", teardown);
  });
}

function formatEvent(event: ReloadEvent): string {
  // The kind doubles as the SSE event name; data carries the rest as JSON.
  // For "refresh" the payload is empty {}; for "reload-failed" it carries
  // the message so the client can surface it.
  let payload: Record<string, unknown> = {};
  if (event.kind === "reload-failed") {
    payload = { message: event.message };
  }
  return `event: ${event.kind}\ndata: ${JSON.stringify(payload)}\n\n`;
}
