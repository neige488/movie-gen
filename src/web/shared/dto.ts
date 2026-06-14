/**
 * DTOs shared between server and client.
 *
 * Domain types use `readonly` arrays and class-like factories; DTOs are
 * plain JSON-serializable shapes. Server transforms domain → DTO; client
 * consumes DTOs directly (no domain rehydration on the browser side — the
 * domain is the server's responsibility).
 */

import type { SyncStatus, TakeSyncStatus } from "@domain/sync-evaluator.js";

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
  /**
   * Per-Take sync status against the current screenplay marker block hash.
   * - "current": Take.screenplayHash matches the marker block hash.
   * - "stale":   Take.screenplayHash differs (older screenplay revision).
   * - "orphan":  parent Shot has no matching marker block (Shot-level orphan
   *              overrides — the Take card typically shows neutral and the
   *              orphan badge surfaces at the Shot card).
   */
  syncStatus: TakeSyncStatus;
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

export interface AllSceneEntryDto {
  slug: string;
  slugline: string;
  isStarred: boolean;
}

/**
 * One BS2 beat as a visual ruler tick on the canvas. Mirrors the BeatSheet
 * domain `Beat` minus the act id (which is implied by the enclosing
 * `CanvasActDto`). `widthPct` is the beat's share of its act row (per-act
 * widths sum to 100). Beats are a visual guide only — Scenes are not assigned
 * to beats.
 */
export interface BeatDto {
  number: number;
  label: string;
  startPage: number;
  endPage: number;
  widthPct: number;
}

/**
 * One act row of the BS2 canvas: the act id, the ordered starred Scene slugs
 * placed in this act (non-starred Scenes are excluded — the canvas shows only
 * the movie sequence), and the act's beat ruler. Scene order matches the
 * manifest (ADR 0002); the canvas draws each Scene as an equal-width block
 * (length ignored, per PRD).
 */
export interface CanvasActDto {
  id: 1 | 2 | 3;
  /** Ordered starred Scene slugs in this act (manifest order). */
  sceneSlugs: string[];
  /** This act's BS2 beats as a proportional ruler. */
  beats: BeatDto[];
}

export interface MovieDto {
  /** Scenes in canonical movie order (manifest linear order, starred only). */
  scenes: SceneDto[];
  /**
   * All scenes (including non-starred) by slug — used by the sidebar so the
   * director can toggle non-starred Scenes back into the movie sequence
   * without leaving the viewer.
   */
  allScenes: AllSceneEntryDto[];
  /**
   * The BS2 canvas view (read-only, slice #20): 3 act rows, each with its
   * ordered starred Scene slugs + beat ruler. Derived from the same manifest
   * SSOT as `scenes`. Omitted when no arrangement is threaded (unit fixtures);
   * the canvas route then has nothing to render.
   */
  acts?: CanvasActDto[];
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
  /** Face reference — single 5-panel split sheet (relative asset path). */
  faceImage: string;
  /** Body reference — single 3-panel split sheet (relative asset path). */
  bodyImage: string;
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

/** Response from POST /api/takes/upload */
export interface TakeUploadResponseDto {
  take: TakeDto;
  sceneSlug: string;
  shotId: string;
}

/**
 * Response from POST /api/scenes/:slug/copy. Includes the new scene's slug
 * so the client can navigate to it (hash route `#scene-<newSlug>`).
 */
export interface SceneCopyResponseDto {
  movie: MovieDto;
  newSlug: string;
}
