/**
 * ReloadOrchestrator — couples the file watcher's onChange to loadProject +
 * EventBus. Tests verify the three end-to-end paths without spinning up a
 * real watcher or a real file system:
 *
 *   1. happy path: load succeeds → swap project + publish "refresh"
 *   2. failure path: load throws → keep previous project + publish "reload-failed"
 *   3. concurrent triggers: if a change fires while a previous reload is in
 *      flight, the later one is queued (no parallel double-load that could
 *      race the swap).
 */
import { describe, expect, it, vi } from "vitest";
import { createEventBus, type ReloadEvent } from "./event-bus.js";
import {
  createReloadOrchestrator,
  type ReloadOrchestrator,
} from "./reload-orchestrator.js";
import { createProject, type Project } from "@domain/movie.js";

function emptyProject(): Project {
  return createProject({
    scenes: [],
    characters: [],
    locations: [],
    props: [],
  });
}

function captureEvents(bus = createEventBus()): {
  bus: ReturnType<typeof createEventBus>;
  events: ReloadEvent[];
} {
  const events: ReloadEvent[] = [];
  bus.subscribe((e) => events.push(e));
  return { bus, events };
}

describe("ReloadOrchestrator", () => {
  it("swaps the project and publishes refresh on a successful reload", async () => {
    const { bus, events } = captureEvents();
    const initial = emptyProject();
    const next = emptyProject();
    const loader = vi.fn().mockResolvedValue(next);

    let current = initial;
    const orchestrator: ReloadOrchestrator = createReloadOrchestrator({
      loadProject: loader,
      getProject: () => current,
      setProject: (p) => {
        current = p;
      },
      bus,
    });

    await orchestrator.reload();

    expect(loader).toHaveBeenCalledTimes(1);
    expect(current).toBe(next);
    expect(events).toEqual([{ kind: "refresh" }]);
  });

  it("keeps the previous project and publishes reload-failed when loadProject throws", async () => {
    const { bus, events } = captureEvents();
    const initial = emptyProject();
    const loader = vi
      .fn()
      .mockRejectedValue(new Error("schema error: shots[0].duration"));

    let current = initial;
    const orchestrator = createReloadOrchestrator({
      loadProject: loader,
      getProject: () => current,
      setProject: (p) => {
        current = p;
      },
      bus,
    });

    await orchestrator.reload();

    expect(current).toBe(initial); // unchanged
    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev?.kind).toBe("reload-failed");
    if (ev?.kind === "reload-failed") {
      expect(ev.message).toContain("schema error");
    }
  });

  it("queues a second reload that fires during an in-flight one (no parallel loads)", async () => {
    const { bus, events } = captureEvents();
    let active = 0;
    let maxConcurrent = 0;
    const loader = vi.fn().mockImplementation(async () => {
      active++;
      maxConcurrent = Math.max(maxConcurrent, active);
      await new Promise((r) => setTimeout(r, 30));
      active--;
      return emptyProject();
    });

    let current = emptyProject();
    const orchestrator = createReloadOrchestrator({
      loadProject: loader,
      getProject: () => current,
      setProject: (p) => {
        current = p;
      },
      bus,
    });

    // Fire 3 reloads in quick succession.
    const a = orchestrator.reload();
    const b = orchestrator.reload();
    const c = orchestrator.reload();
    await Promise.all([a, b, c]);

    // At no point should there be more than one in-flight load.
    expect(maxConcurrent).toBe(1);
    // We coalesce: the rule is "if a load is in-flight, mark dirty and fire
    // exactly one follow-up afterwards". That means 3 triggers → 2 loads max.
    expect(loader.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(loader.mock.calls.length).toBeLessThanOrEqual(2);
    // The bus saw at least one refresh after the dust settles.
    expect(events.filter((e) => e.kind === "refresh").length).toBeGreaterThanOrEqual(1);
  });

  it("after a failure, the next successful reload still swaps and publishes refresh", async () => {
    const { bus, events } = captureEvents();
    const initial = emptyProject();
    const recovered = emptyProject();

    let callCount = 0;
    const loader = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error("temp parse error");
      return recovered;
    });

    let current = initial;
    const orchestrator = createReloadOrchestrator({
      loadProject: loader,
      getProject: () => current,
      setProject: (p) => {
        current = p;
      },
      bus,
    });

    await orchestrator.reload(); // fails
    expect(current).toBe(initial);
    await orchestrator.reload(); // succeeds
    expect(current).toBe(recovered);

    const refreshes = events.filter((e) => e.kind === "refresh");
    const failures = events.filter((e) => e.kind === "reload-failed");
    expect(refreshes.length).toBe(1);
    expect(failures.length).toBe(1);
  });
});
