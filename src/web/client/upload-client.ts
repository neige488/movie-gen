/**
 * Client-side helpers for upload endpoints.
 *
 * Mirrors the AssetSlot taxonomy from the server but kept as its own copy
 * here so the client bundle doesn't import server-only modules. The shapes
 * must match `AssetSlot` in `src/adapter/asset-store.ts`.
 */

import type {
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
