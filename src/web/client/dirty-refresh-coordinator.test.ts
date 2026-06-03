/**
 * DirtyRefreshCoordinator — extracted from live-reload.tsx so the deferral
 * policy can be unit tested without a React renderer.
 *
 * Behavior contract:
 *   - When no editors are registered as open, requestRefresh() immediately
 *     invokes the refresh callback.
 *   - While at least one editor is open, requestRefresh() sets pending=true
 *     and DOES NOT invoke refresh.
 *   - When the last open editor unregisters and pending is true, refresh
 *     fires once and pending clears.
 *   - Multiple requestRefresh calls while pending collapse to a single
 *     refresh (idempotency).
 *   - forceRefresh() fires refresh immediately and clears pending regardless
 *     of open count.
 *   - State change callbacks fire whenever pending flips so the React layer
 *     can re-render.
 */
import { describe, expect, it, vi } from "vitest";
import {
  createDirtyRefreshCoordinator,
} from "./dirty-refresh-coordinator.js";

describe("DirtyRefreshCoordinator", () => {
  it("immediately refreshes when no editors are open", () => {
    const refresh = vi.fn();
    const coord = createDirtyRefreshCoordinator({ refresh });
    coord.requestRefresh();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(coord.isPending()).toBe(false);
  });

  it("defers refresh while an editor is registered", () => {
    const refresh = vi.fn();
    const coord = createDirtyRefreshCoordinator({ refresh });
    const unregister = coord.registerOpen();
    coord.requestRefresh();
    expect(refresh).not.toHaveBeenCalled();
    expect(coord.isPending()).toBe(true);
    unregister();
  });

  it("fires the deferred refresh when the last editor unregisters", () => {
    const refresh = vi.fn();
    const coord = createDirtyRefreshCoordinator({ refresh });
    const u1 = coord.registerOpen();
    coord.requestRefresh();
    expect(refresh).not.toHaveBeenCalled();
    u1();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(coord.isPending()).toBe(false);
  });

  it("only fires once for the deferred refresh even after multiple requests", () => {
    const refresh = vi.fn();
    const coord = createDirtyRefreshCoordinator({ refresh });
    const u1 = coord.registerOpen();
    coord.requestRefresh();
    coord.requestRefresh();
    coord.requestRefresh();
    expect(refresh).not.toHaveBeenCalled();
    u1();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not fire on editor close when no refresh was requested", () => {
    const refresh = vi.fn();
    const coord = createDirtyRefreshCoordinator({ refresh });
    const u1 = coord.registerOpen();
    u1();
    expect(refresh).not.toHaveBeenCalled();
    expect(coord.isPending()).toBe(false);
  });

  it("requires every editor to unregister before firing", () => {
    const refresh = vi.fn();
    const coord = createDirtyRefreshCoordinator({ refresh });
    const u1 = coord.registerOpen();
    const u2 = coord.registerOpen();
    coord.requestRefresh();
    u1();
    expect(refresh).not.toHaveBeenCalled();
    u2();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("forceRefresh fires refresh immediately and clears pending even while editors are open", () => {
    const refresh = vi.fn();
    const coord = createDirtyRefreshCoordinator({ refresh });
    coord.registerOpen();
    coord.requestRefresh();
    expect(refresh).not.toHaveBeenCalled();
    coord.forceRefresh();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(coord.isPending()).toBe(false);
  });

  it("invokes onPendingChanged with new pending state for UI re-render", () => {
    const refresh = vi.fn();
    const onPendingChanged = vi.fn();
    const coord = createDirtyRefreshCoordinator({ refresh, onPendingChanged });
    const u1 = coord.registerOpen();
    coord.requestRefresh();
    expect(onPendingChanged).toHaveBeenLastCalledWith(true);
    u1();
    expect(onPendingChanged).toHaveBeenLastCalledWith(false);
  });

  it("opening a NEW editor after a refresh request keeps things deferred (still pending)", () => {
    // Realistic case: user typed in a screenplay editor, dirty=true.
    // SSE refresh arrives → pending.
    // While pending, user opens a slugline editor too.
    // First editor closes (count drops 2 → 1) — still pending, no refresh yet.
    // Second editor closes (count drops 1 → 0) — refresh fires.
    const refresh = vi.fn();
    const coord = createDirtyRefreshCoordinator({ refresh });
    const screenplay = coord.registerOpen();
    coord.requestRefresh();
    const slugline = coord.registerOpen();
    screenplay();
    expect(refresh).not.toHaveBeenCalled();
    slugline();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("a refresh fired immediately while no editors are open does not trip onPendingChanged", () => {
    const refresh = vi.fn();
    const onPendingChanged = vi.fn();
    const coord = createDirtyRefreshCoordinator({ refresh, onPendingChanged });
    coord.requestRefresh();
    expect(refresh).toHaveBeenCalled();
    // pending stayed false the whole time → no notification needed.
    expect(onPendingChanged).not.toHaveBeenCalled();
  });
});
