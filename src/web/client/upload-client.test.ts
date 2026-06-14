/**
 * Client fetch helper tests — wire contract only (URL / method / body / error
 * surfacing). The DOM components that call these are exercised manually (the
 * codebase has no jsdom/testing-library setup); these tests pin the HTTP shape
 * the server endpoints expect so a rename/typo can't silently break the wire.
 *
 * Currently covers reorderScene (Slice #19). fetch is stubbed via a per-test
 * global override.
 */

import { describe, expect, it, afterEach, vi } from "vitest";
import type { MovieDto } from "../shared/dto.js";
import { reorderScene, moveSceneToAct } from "./upload-client.js";

const EMPTY_MOVIE: MovieDto = {
  scenes: [],
  allScenes: [],
  totalPages: 110,
  characters: [],
  locations: [],
  props: [],
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("reorderScene", () => {
  it("POSTs to /api/scenes/:slug/reorder with {direction} and returns the MovieDto", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    globalThis.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify(EMPTY_MOVIE), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const result = await reorderScene("s03-c", "up");

    expect(result).toEqual(EMPTY_MOVIE);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("/api/scenes/s03-c/reorder");
    expect(calls[0]!.init.method).toBe("POST");
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      direction: "up",
    });
  });

  it("url-encodes the slug", async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (url: string | URL) => {
      calls.push(String(url));
      return new Response(JSON.stringify(EMPTY_MOVIE), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    await reorderScene("s01 weird/slug", "down");
    expect(calls[0]).toBe("/api/scenes/s01%20weird%2Fslug/reorder");
  });

  it("throws the server's error message on a non-ok response", async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ error: "unknown scene \"ghost\"" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    await expect(reorderScene("ghost", "up")).rejects.toThrow(
      /unknown scene/,
    );
  });
});

describe("moveSceneToAct", () => {
  it("POSTs to /api/scenes/:slug/move with {toActId, beforeSlug}", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    globalThis.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify(EMPTY_MOVIE), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const result = await moveSceneToAct("s02-b", 3, "s05-e");

    expect(result).toEqual(EMPTY_MOVIE);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("/api/scenes/s02-b/move");
    expect(calls[0]!.init.method).toBe("POST");
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      toActId: 3,
      beforeSlug: "s05-e",
    });
  });

  it("sends beforeSlug=null for an end-of-row drop and url-encodes the slug", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    globalThis.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify(EMPTY_MOVIE), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    await moveSceneToAct("s01 weird/slug", 1, null);
    expect(calls[0]!.url).toBe("/api/scenes/s01%20weird%2Fslug/move");
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      toActId: 1,
      beforeSlug: null,
    });
  });

  it("throws the server's error message on a non-ok response", async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ error: "invalid act id 9" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    await expect(moveSceneToAct("s01-a", 1, null)).rejects.toThrow(
      /invalid act id/,
    );
  });
});
