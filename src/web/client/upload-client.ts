/**
 * Client-side helpers for upload endpoints.
 *
 * Mirrors the AssetSlot taxonomy from the server but kept as its own copy
 * here so the client bundle doesn't import server-only modules. The shapes
 * must match `AssetSlot` in `src/adapter/asset-store.ts`.
 */

import type {
  MovieDto,
  TakeUploadResponseDto,
  UploadResponseDto,
} from "../shared/dto.js";

export type AssetSlotSpec =
  | { kind: "character-headshot"; character: string }
  | {
      kind: "character-face";
      character: string;
      look: string;
      index: number;
    }
  | {
      kind: "character-body";
      character: string;
      look: string;
      index: number;
    }
  | { kind: "location-ref"; location: string; refName: string }
  | { kind: "prop-ref"; prop: string; refName: string };

export async function uploadAsset(
  slot: AssetSlotSpec,
  file: File,
): Promise<UploadResponseDto> {
  const form = new FormData();
  form.append("slot", JSON.stringify(slot));
  form.append("file", file);

  const res = await fetch("/api/assets/upload", {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    let message = `upload failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  return (await res.json()) as UploadResponseDto;
}

/**
 * Toggle a Scene's `isStarred`. Returns the full updated MovieDto so the
 * caller can refresh the movie sequence + sidebar in one round-trip. The
 * server is authoritative — no optimistic UI on the client side because the
 * Take-starred operation has a sibling auto-OFF side effect that's painful
 * to mirror in the browser; we use the same response-driven shape for
 * Scene-starred for consistency.
 */
export async function toggleSceneStarred(
  sceneSlug: string,
  isStarred: boolean,
): Promise<MovieDto> {
  const res = await fetch(
    `/api/scenes/${encodeURIComponent(sceneSlug)}/starred`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isStarred }),
    },
  );
  if (!res.ok) throw await asError(res, "scene starred toggle failed");
  return (await res.json()) as MovieDto;
}

/**
 * Toggle a Take's `isStarred`. When `isStarred=true`, the server enforces the
 * Shot-level invariant by auto-OFFing the sibling starred Take. The returned
 * MovieDto reflects that side effect already.
 */
export async function toggleTakeStarred(
  sceneSlug: string,
  shotId: string,
  takeId: string,
  isStarred: boolean,
): Promise<MovieDto> {
  const res = await fetch(
    `/api/scenes/${encodeURIComponent(sceneSlug)}/shots/${encodeURIComponent(shotId)}/takes/${encodeURIComponent(takeId)}/starred`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isStarred }),
    },
  );
  if (!res.ok) throw await asError(res, "take starred toggle failed");
  return (await res.json()) as MovieDto;
}

async function asError(res: Response, fallback: string): Promise<Error> {
  let message = `${fallback} (${res.status})`;
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) message = body.error;
  } catch {
    // ignore
  }
  return new Error(message);
}

export async function uploadTake(
  sceneSlug: string,
  shotId: string,
  file: File,
): Promise<TakeUploadResponseDto> {
  const form = new FormData();
  form.append("sceneSlug", sceneSlug);
  form.append("shotId", shotId);
  form.append("file", file);

  const res = await fetch("/api/takes/upload", {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    let message = `take upload failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  return (await res.json()) as TakeUploadResponseDto;
}
