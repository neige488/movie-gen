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
  /**
   * The copy-paste prompt the director pastes into the engine: the movie-level
   * preset's prefix + `prompt` + suffix, assembled server-side
   * (`assembleFinalPrompt`). Derived — never stored on disk.
   */
  finalPrompt: string;
  /**
   * Engine ref `@names` mentioned inline in `prompt` (without the leading `@`),
   * parsed server-side. Drives the ref chips — refs live in the prompt body now,
   * not in a structured field.
   */
  refMentions: string[];
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
 * One BS2 beat positioned on the canvas act timeline. Mirrors the BeatSheet
 * domain `Beat` minus the act id (implied by the enclosing `CanvasActDto`).
 * `leftPct`/`widthPct` place the beat on its act's page timeline (0–100%):
 * span beats render as proportional bars, point beats as zero-width markers.
 * Beats are a visual guide only — Scenes are not assigned to beats.
 */
export interface BeatDto {
  number: number;
  label: string;
  /** One-line beat description (guide book ch.4) — shown in the hover tooltip. */
  description: string;
  startPage: number;
  endPage: number;
  /** "span" (page range = dwell time) or "point" (single-page moment/turn). */
  kind: "span" | "point";
  /** Start offset within the act's page timeline, in percent (0–100). */
  leftPct: number;
  /** Page-span width within the act, in percent. 0 for point beats. */
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
  /** This act's BS2 beats positioned on its page timeline. */
  beats: BeatDto[];
  /** Act's page range (Blake 110p basis) — e.g. act 1 = 1..25. */
  pageStart: number;
  pageEnd: number;
  /**
   * Act's share of the movie's page length, in percent. The canvas scales each
   * act row's width to this so the acts' real length differences are visible
   * (act 2 ≈ 55%, acts 1/3 ≈ 22%/23%).
   */
  pagePct: number;
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
  /**
   * The movie's total length in BS2 pages (≈ minutes; default 110). Only
   * rescales the displayed beat page numbers — proportions are scale-invariant.
   */
  totalPages: number;
  characters: CharacterDto[];
  locations: LocationDto[];
  props: PropDto[];
}

// ---------------------------------------------------------------------------
// Library DTOs — richer shapes for /library page (slice #2)
// ---------------------------------------------------------------------------

export interface ImageReferenceDto {
  image: string; // relative path under assets root (empty if unset)
  name?: string;
  prompt?: string;
  /** Engine `@이름` (@mention handle), e.g. `p1_c_suah_face`. */
  refName?: string;
}

export interface LookDto {
  name: string;
  /** Face reference — single 5-panel split sheet, with optional engine @refName. */
  face: ImageReferenceDto;
  /** Body reference — single 3-panel split sheet, with optional engine @refName. */
  body: ImageReferenceDto;
  /** Optional outfit source — single 2-panel (front+back) sheet + its prompt. */
  uniform?: ImageReferenceDto;
}

export interface LibraryCharacterDto {
  name: string;
  /** Face ID — image + optional generation prompt / @refName. */
  headshot: ImageReferenceDto;
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
