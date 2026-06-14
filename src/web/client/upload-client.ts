/**
 * Client-side helpers for upload endpoints.
 *
 * Mirrors the AssetSlot taxonomy from the server but kept as its own copy
 * here so the client bundle doesn't import server-only modules. The shapes
 * must match `AssetSlot` in `src/adapter/asset-store.ts`.
 */

import type {
  MovieDto,
  SceneCopyResponseDto,
  TakeUploadResponseDto,
  UploadResponseDto,
} from "../shared/dto.js";

export type AssetSlotSpec =
  | { kind: "character-headshot"; character: string }
  | { kind: "character-face"; character: string; look: string }
  | { kind: "character-body"; character: string; look: string }
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

/**
 * Light-edit (Slice 5) endpoints — slugline / screenplay / copy.
 *
 * Each returns the full updated MovieDto (or {movie, newSlug} for copy) so
 * the App can update its state in one round-trip; on error the body's
 * `error` field becomes the thrown message so the UI can render it directly.
 */
export async function editSceneSlugline(
  sceneSlug: string,
  slugline: string,
): Promise<MovieDto> {
  const res = await fetch(
    `/api/scenes/${encodeURIComponent(sceneSlug)}/slugline`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slugline }),
    },
  );
  if (!res.ok) throw await asError(res, "slugline edit failed");
  return (await res.json()) as MovieDto;
}

export async function editSceneScreenplay(
  sceneSlug: string,
  markdown: string,
): Promise<MovieDto> {
  const res = await fetch(
    `/api/scenes/${encodeURIComponent(sceneSlug)}/screenplay`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ markdown }),
    },
  );
  if (!res.ok) throw await asError(res, "screenplay edit failed");
  return (await res.json()) as MovieDto;
}

export async function copySceneRequest(
  sourceSlug: string,
  newSlug: string,
): Promise<SceneCopyResponseDto> {
  const res = await fetch(
    `/api/scenes/${encodeURIComponent(sourceSlug)}/copy`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ newSlug }),
    },
  );
  if (!res.ok) throw await asError(res, "scene copy failed");
  return (await res.json()) as SceneCopyResponseDto;
}

/**
 * Acknowledge a Shot — refresh `Shot.screenplayHash` server-side to the
 * current marker block hash. Returns the updated MovieDto so the client can
 * drop the stale badge in the same tick.
 *
 * Server rejects orphan Shots (400) — the UI hides the button on orphan
 * Shots so this should never fire in normal use.
 */
export async function acknowledgeShotRequest(
  sceneSlug: string,
  shotId: string,
): Promise<MovieDto> {
  const res = await fetch(
    `/api/scenes/${encodeURIComponent(sceneSlug)}/shots/${encodeURIComponent(shotId)}/acknowledge`,
    { method: "POST" },
  );
  if (!res.ok) throw await asError(res, "shot acknowledge failed");
  return (await res.json()) as MovieDto;
}

/**
 * Acknowledge a Take — refresh `Take.screenplayHash` server-side. Take's
 * other fields (videoPath, createdAt, isStarred) stay untouched. Returns
 * the updated MovieDto.
 */
export async function acknowledgeTakeRequest(
  sceneSlug: string,
  shotId: string,
  takeId: string,
): Promise<MovieDto> {
  const res = await fetch(
    `/api/scenes/${encodeURIComponent(sceneSlug)}/shots/${encodeURIComponent(shotId)}/takes/${encodeURIComponent(takeId)}/acknowledge`,
    { method: "POST" },
  );
  if (!res.ok) throw await asError(res, "take acknowledge failed");
  return (await res.json()) as MovieDto;
}

/**
 * Shot meta edit (Slice 7) — per-field PUT endpoints. Each returns the full
 * MovieDto so the App can replace state in one tick. Errors surface the
 * server's `error` field verbatim (e.g. domain invariant violations like
 * "duration must be within [4, 15]" or "unknown Look").
 */
export async function editShotPrompt(
  sceneSlug: string,
  shotId: string,
  prompt: string,
): Promise<MovieDto> {
  const res = await fetch(
    `/api/scenes/${encodeURIComponent(sceneSlug)}/shots/${encodeURIComponent(shotId)}/prompt`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt }),
    },
  );
  if (!res.ok) throw await asError(res, "shot prompt edit failed");
  return (await res.json()) as MovieDto;
}

export async function editShotDuration(
  sceneSlug: string,
  shotId: string,
  duration: number,
): Promise<MovieDto> {
  const res = await fetch(
    `/api/scenes/${encodeURIComponent(sceneSlug)}/shots/${encodeURIComponent(shotId)}/duration`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ duration }),
    },
  );
  if (!res.ok) throw await asError(res, "shot duration edit failed");
  return (await res.json()) as MovieDto;
}

export async function editShotCharacterRefs(
  sceneSlug: string,
  shotId: string,
  refs: { character: string; look: string }[],
): Promise<MovieDto> {
  const res = await fetch(
    `/api/scenes/${encodeURIComponent(sceneSlug)}/shots/${encodeURIComponent(shotId)}/character-refs`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refs }),
    },
  );
  if (!res.ok) throw await asError(res, "shot character-refs edit failed");
  return (await res.json()) as MovieDto;
}

export async function editShotLocationRefs(
  sceneSlug: string,
  shotId: string,
  refs: { location: string; reference?: string }[],
): Promise<MovieDto> {
  const res = await fetch(
    `/api/scenes/${encodeURIComponent(sceneSlug)}/shots/${encodeURIComponent(shotId)}/location-refs`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refs }),
    },
  );
  if (!res.ok) throw await asError(res, "shot location-refs edit failed");
  return (await res.json()) as MovieDto;
}

export async function editShotPropRefs(
  sceneSlug: string,
  shotId: string,
  refs: { prop: string; reference?: string }[],
): Promise<MovieDto> {
  const res = await fetch(
    `/api/scenes/${encodeURIComponent(sceneSlug)}/shots/${encodeURIComponent(shotId)}/prop-refs`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refs }),
    },
  );
  if (!res.ok) throw await asError(res, "shot prop-refs edit failed");
  return (await res.json()) as MovieDto;
}

/**
 * Set / clear a Shot's `prevShotRef` (chaining) — Slice 8. Pass `null` to
 * remove the chain. The server enforces the same-Scene + earlier-Shot
 * invariant via the domain (createScene) so an invalid ref returns 400 with
 * the domain message verbatim.
 */
export async function editShotPrevShotRef(
  sceneSlug: string,
  shotId: string,
  prevShotRef: string | null,
): Promise<MovieDto> {
  const res = await fetch(
    `/api/scenes/${encodeURIComponent(sceneSlug)}/shots/${encodeURIComponent(shotId)}/prev-shot-ref`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prevShotRef }),
    },
  );
  if (!res.ok) throw await asError(res, "shot prev-shot-ref edit failed");
  return (await res.json()) as MovieDto;
}

/**
 * Reorder a Scene one step earlier ("up") or later ("down") in the movie
 * sequence — Slice #19. Hits POST /api/scenes/:slug/reorder, which rewrites
 * the manifest (data/movie.yaml) atomically and returns the full updated
 * MovieDto so the caller refreshes the sequence in one round-trip. The server
 * is authoritative (no optimistic UI) so the order always matches the
 * persisted manifest, consistent with the other mutation helpers here.
 */
export async function reorderScene(
  sceneSlug: string,
  direction: "up" | "down",
): Promise<MovieDto> {
  const res = await fetch(
    `/api/scenes/${encodeURIComponent(sceneSlug)}/reorder`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ direction }),
    },
  );
  if (!res.ok) throw await asError(res, "scene reorder failed");
  return (await res.json()) as MovieDto;
}

/**
 * Move a Scene to an act + visible drop position — BS2 canvas drag (Slice #21).
 * Hits POST /api/scenes/:slug/move, which rewrites the manifest
 * (data/movie.yaml) atomically (allowing CROSS-act moves, unlike reorderScene's
 * same-act ▲/▼) and returns the full updated MovieDto so the caller refreshes
 * the canvas + sequence in one round-trip.
 *
 * `toActId` is the destination act (1, 2, or 3). `beforeSlug` is the starred
 * slug the dragged block was dropped *before*, or null for the end of that
 * act's visible row — the server resolves it to a manifest index so interleaved
 * non-starred Scenes keep their slots. The server is authoritative (no
 * optimistic UI), consistent with the other mutation helpers.
 */
export async function moveSceneToAct(
  sceneSlug: string,
  toActId: 1 | 2 | 3,
  beforeSlug: string | null,
): Promise<MovieDto> {
  const res = await fetch(`/api/scenes/${encodeURIComponent(sceneSlug)}/move`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ toActId, beforeSlug }),
  });
  if (!res.ok) throw await asError(res, "scene move failed");
  return (await res.json()) as MovieDto;
}

/** Set the movie's total length in BS2 pages (≈ minutes). Returns updated MovieDto. */
export async function setMovieTotalPages(
  totalPages: number,
): Promise<MovieDto> {
  const res = await fetch(`/api/movie/total-pages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ totalPages }),
  });
  if (!res.ok) throw await asError(res, "set total pages failed");
  return (await res.json()) as MovieDto;
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
