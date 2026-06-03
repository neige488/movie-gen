/**
 * DTOs shared between server and client.
 *
 * Domain types use `readonly` arrays and class-like factories; DTOs are
 * plain JSON-serializable shapes. Server transforms domain → DTO; client
 * consumes DTOs directly (no domain rehydration on the browser side — the
 * domain is the server's responsibility).
 */

import type { SyncStatus } from "@domain/sync-evaluator.js";

export interface MarkerBlockDto {
  shotId: string;
  text: string;
  openLine: number;
  closeLine: number;
}

export interface TakeDto {
  id: string;
  videoPath: string;
  screenplayHash: string;
  /** ISO 8601 timestamp of original upload. Immutable. */
  createdAt: string;
  isStarred: boolean;
}

export interface CharacterRefDto {
  character: string;
  look: string;
}

export interface LocationRefDto {
  location: string;
  reference?: string;
}

export interface PropRefDto {
  prop: string;
  reference?: string;
}

export interface ShotDto {
  id: string;
  prompt: string;
  duration: number;
  screenplayHash: string;
  prevShotRef?: string;
  characterRefs: CharacterRefDto[];
  locationRefs: LocationRefDto[];
  propRefs: PropRefDto[];
  takes: TakeDto[];
  syncStatus: SyncStatus;
}

export interface SceneDto {
  slug: string;
  slugline: string;
  screenplay: string;
  isStarred: boolean;
  shots: ShotDto[];
  /** Marker blocks parsed from the screenplay (in source order). */
  markers: MarkerBlockDto[];
}

export interface CharacterDto {
  name: string;
  headshot: string;
  looks: { name: string }[];
}

export interface LocationDto {
  name: string;
}

export interface PropDto {
  name: string;
}

export interface MovieDto {
  /** Scenes in canonical movie order (isStarred + slug-prefix sort). */
  scenes: SceneDto[];
  /** All scenes (including non-starred) by slug for diagnostics. */
  allScenes: { slug: string; isStarred: boolean }[];
  characters: CharacterDto[];
  locations: LocationDto[];
  props: PropDto[];
}

// ---------------------------------------------------------------------------
// Library DTOs — richer shapes for /library page (slice #2)
// ---------------------------------------------------------------------------

export interface ImageReferenceDto {
  name: string;
  prompt: string;
  image: string; // relative path under assets root (empty if unset)
}

export interface LookDto {
  name: string;
  /** 3 entries, possibly empty strings when a slot is unfilled. */
  bodyImages: string[];
  /** 5 entries, possibly empty strings when a slot is unfilled. */
  faceImages: string[];
}

export interface LibraryCharacterDto {
  name: string;
  headshot: string;
  looks: LookDto[];
}

export interface LibraryLocationDto {
  name: string;
  references: ImageReferenceDto[];
}

export interface LibraryPropDto {
  name: string;
  references: ImageReferenceDto[];
}

export interface LibraryDto {
  characters: LibraryCharacterDto[];
  locations: LibraryLocationDto[];
  props: LibraryPropDto[];
}

/** Response from POST /api/assets/upload */
export interface UploadResponseDto {
  /** Relative path under assets root, also written into YAML. */
  relativePath: string;
}
