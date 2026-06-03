/**
 * SSE handler integration test — boots a real Express app, connects via
 * Node's fetch, and verifies wire-level behavior:
 *
 *   - Content-Type header is text/event-stream
 *   - Events published on the bus appear on the wire in `event: <name>\ndata: <json>\n\n` form
 *   - Multiple subscribers each receive every event
 *   - Closing the response disconnects the listener (bus.subscriberCount drops)
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { createEventBus, type EventBus } from "./event-bus.js";
import { attachSseHandler } from "./sse-handler.js";

interface Harness {
  bus: EventBus;
  port: number;
  server: Server;
  close: () => Promise<void>;
}

async function bootHarness(): Promise<Harness> {
  const app = express();
  const bus = createEventBus();
  attachSseHandler(app, bus);
  return new Promise<Harness>((resolve, reject) => {
    const server = createServer(app);
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      resolve({
        bus,
        port: addr.port,
        server,
        close: () =>
          new Promise<void>((res, rej) =>
            server.close((e) => (e ? rej(e) : res())),
          ),
      });
    });
  });
}

/**
 * Read SSE events incrementally. Pulls chunks from the stream and emits
 * fully-formed event records as they arrive.
 */
async function* readSse(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<{ event: string; data: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    // SSE records are separated by a blank line.
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const record = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let event = "message";
      const dataLines: string[] = [];
      for (const line of record.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
        // ignore comments (lines starting with ":") and unknown keys
      }
      // Skip pure-comment heartbeats (no data lines).
      if (dataLines.length === 0) continue;
      yield { event, data: dataLines.join("\n") };
    }
  }
}

async function wait(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

describe("SSE handler", () => {
  let h: Harness;

  beforeEach(async () => {
    h = await bootHarness();
  });

  afterEach(async () => {
    await h.close();
  });

  it("sets text/event-stream content-type", async () => {
    const controller = new AbortController();
    const res = await fetch(`http://127.0.0.1:${h.port}/api/events`, {
      signal: controller.signal,
    });
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    controller.abort();
  });

  it("delivers a refresh event published after the client connects", async () => {
    const controller = new AbortController();
    const res = await fetch(`http://127.0.0.1:${h.port}/api/events`, {
      signal: controller.signal,
    });
    // Wait for the SSE handler to register on the bus.
    await wait(50);
    expect(h.bus.subscriberCount()).toBe(1);

    const stream = res.body;
    if (!stream) throw new Error("no body");
    const events: { event: string; data: string }[] = [];
    const reading = (async () => {
      for await (const ev of readSse(stream)) {
        events.push(ev);
        if (events.length >= 1) break;
      }
    })();

    h.bus.publish({ kind: "refresh" });

    await reading;
    expect(events).toEqual([{ event: "refresh", data: "{}" }]);
    controller.abort();
  });

  it("delivers reload-failed events with the error message", async () => {
    const controller = new AbortController();
    const res = await fetch(`http://127.0.0.1:${h.port}/api/events`, {
      signal: controller.signal,
    });
    await wait(50);
    const stream = res.body;
    if (!stream) throw new Error("no body");

    const events: { event: string; data: string }[] = [];
    const reading = (async () => {
      for await (const ev of readSse(stream)) {
        events.push(ev);
        if (events.length >= 1) break;
      }
    })();

    h.bus.publish({ kind: "reload-failed", message: "yaml schema" });
    await reading;

    expect(events[0]?.event).toBe("reload-failed");
    const payload = JSON.parse(events[0]?.data ?? "{}") as {
      message?: string;
    };
    expect(payload.message).toBe("yaml schema");

    controller.abort();
  });

  it("fan-outs to multiple subscribers", async () => {
    const c1 = new AbortController();
    const c2 = new AbortController();
    const r1 = await fetch(`http://127.0.0.1:${h.port}/api/events`, {
      signal: c1.signal,
    });
    const r2 = await fetch(`http://127.0.0.1:${h.port}/api/events`, {
      signal: c2.signal,
    });
    await wait(50);
    expect(h.bus.subscriberCount()).toBe(2);

    if (!r1.body || !r2.body) throw new Error("no body");
    const got1: string[] = [];
    const got2: string[] = [];
    const reading = Promise.all([
      (async () => {
        for await (const ev of readSse(r1.body!)) {
          got1.push(ev.event);
          if (got1.length >= 1) break;
        }
      })(),
      (async () => {
        for await (const ev of readSse(r2.body!)) {
          got2.push(ev.event);
          if (got2.length >= 1) break;
        }
      })(),
    ]);

    h.bus.publish({ kind: "refresh" });
    await reading;

    expect(got1).toEqual(["refresh"]);
    expect(got2).toEqual(["refresh"]);
    c1.abort();
    c2.abort();
  });

  it("drops subscriber count when the client aborts", async () => {
    const controller = new AbortController();
    const res = await fetch(`http://127.0.0.1:${h.port}/api/events`, {
      signal: controller.signal,
    });
    await wait(50);
    expect(h.bus.subscriberCount()).toBe(1);

    controller.abort();
    // Consume the body to let fetch resolve its abort path cleanly.
    try {
      await res.body?.cancel();
    } catch {
      // ignore — abort already invalidated the stream
    }
    // Give Express time to fire the response 'close' event.
    await wait(200);
    expect(h.bus.subscriberCount()).toBe(0);
  });
});
