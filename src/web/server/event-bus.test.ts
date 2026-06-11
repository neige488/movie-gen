/**
 * EventBus — in-process pub/sub used to fan-out reload triggers from the file
 * watcher to N connected SSE clients.
 *
 * The bus is intentionally framework-agnostic: it knows nothing about HTTP or
 * SSE wire format. The SSE layer (sse-handler.ts) subscribes to the bus and
 * translates each event into the `event: <name>\ndata: <json>\n\n` envelope.
 *
 * Tests below verify pure behavior — multiple subscribers, unsubscribe, late
 * subscribers (no replay — we're not building an event log). One subscriber
 * throwing must not block others.
 */
import { describe, expect, it, vi } from "vitest";
import { createEventBus, type ReloadEvent } from "./event-bus.js";

describe("EventBus", () => {
  it("delivers a published event to a single subscriber", () => {
    const bus = createEventBus();
    const handler = vi.fn();
    bus.subscribe(handler);
    bus.publish({ kind: "refresh" });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ kind: "refresh" });
  });

  it("delivers a published event to multiple subscribers in subscription order", () => {
    const bus = createEventBus();
    const calls: number[] = [];
    bus.subscribe(() => calls.push(1));
    bus.subscribe(() => calls.push(2));
    bus.subscribe(() => calls.push(3));
    bus.publish({ kind: "refresh" });
    expect(calls).toEqual([1, 2, 3]);
  });

  it("unsubscribe stops further delivery to that subscriber", () => {
    const bus = createEventBus();
    const handler = vi.fn();
    const unsubscribe = bus.subscribe(handler);
    bus.publish({ kind: "refresh" });
    expect(handler).toHaveBeenCalledTimes(1);
    unsubscribe();
    bus.publish({ kind: "refresh" });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("publishes reload-failed events with an error message", () => {
    const bus = createEventBus();
    const handler = vi.fn();
    bus.subscribe(handler);
    const event: ReloadEvent = {
      kind: "reload-failed",
      message: "schema error",
    };
    bus.publish(event);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it("late subscribers do not receive past events (no replay)", () => {
    const bus = createEventBus();
    bus.publish({ kind: "refresh" });
    const handler = vi.fn();
    bus.subscribe(handler);
    expect(handler).not.toHaveBeenCalled();
  });

  it("a throwing subscriber does not block other subscribers", () => {
    const bus = createEventBus();
    const good1 = vi.fn();
    const good2 = vi.fn();
    bus.subscribe(good1);
    bus.subscribe(() => {
      throw new Error("subscriber boom");
    });
    bus.subscribe(good2);
    // Should not throw — the bus catches per-subscriber errors so one bad
    // listener cannot stall fan-out.
    expect(() => bus.publish({ kind: "refresh" })).not.toThrow();
    expect(good1).toHaveBeenCalledTimes(1);
    expect(good2).toHaveBeenCalledTimes(1);
  });

  it("subscriberCount reflects active subscriptions", () => {
    const bus = createEventBus();
    expect(bus.subscriberCount()).toBe(0);
    const off1 = bus.subscribe(() => {});
    const off2 = bus.subscribe(() => {});
    expect(bus.subscriberCount()).toBe(2);
    off1();
    expect(bus.subscriberCount()).toBe(1);
    off2();
    expect(bus.subscriberCount()).toBe(0);
  });
});
