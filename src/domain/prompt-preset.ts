/**
 * PromptPreset — movie-level prompt scaffolding.
 *
 * The tool does not call the video engine (씨댄스/Runway); the director copies a
 * Shot's prompt into the engine by hand. To avoid retyping the boilerplate
 * ("cinematic 4K …") and the negative constraints on every Shot, a single
 * movie-level preset holds:
 *  - `prefix` / `suffix`: common text wrapped around every Shot prompt. May be
 *    English (prefix = camera/quality look) or Korean (suffix = negatives).
 *
 * Refs are written INLINE in the Shot prompt as `@name` (not a generated ref
 * block) — the engine resolves `@name` to the registered reference image. The
 * set of valid `@names` is the project's ImageReference `refName`s (see
 * `collectRefNames` in movie.ts), NOT a list stored on the preset.
 *
 * `assembleFinalPrompt` derives the copy-paste string on the fly — only the
 * pieces (preset + Shot.prompt) live on disk, never the assembled whole.
 */

import type { Shot } from "./movie.js";

export interface PromptPreset {
  readonly prefix: string;
  readonly suffix: string;
}

export interface CreatePromptPresetInput {
  prefix?: string;
  suffix?: string;
}

/**
 * Build a PromptPreset. Every field is optional on disk — missing affixes
 * default to empty (so an absent file behaves as "no common prompt").
 */
export function createPromptPreset(input: CreatePromptPresetInput): PromptPreset {
  return {
    prefix: input.prefix ?? "",
    suffix: input.suffix ?? "",
  };
}

/**
 * Assemble the copy-paste prompt the director pastes into the engine:
 *   prefix → Shot.prompt → suffix
 * Empty sections are omitted; sections are joined by a blank line. The Shot
 * prompt body carries its own inline `@name` refs, so no ref block is appended.
 * Pure — only the Shot and the preset are needed.
 */
export function assembleFinalPrompt(shot: Shot, preset: PromptPreset): string {
  return [preset.prefix, shot.prompt, preset.suffix]
    .map((s) => s.trim())
    .filter((s) => s !== "")
    .join("\n\n");
}

const MENTION_RE = /@([a-z0-9_]+)/g;

/**
 * Extract the engine ref `@names` mentioned in a text, in first-seen order,
 * de-duplicated, WITHOUT the leading `@`. Matches the registered-name charset
 * (lowercase letters, digits, underscore — hyphens are not allowed by the
 * engine).
 */
export function extractRefMentions(text: string): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(MENTION_RE)) {
    const name = m[1];
    if (name) seen.add(name);
  }
  return [...seen];
}

/**
 * Find `@mentions` across the given texts that are NOT in the registry of valid
 * `@names` (the project's ImageReference refNames — see `collectRefNames`).
 * Returns sorted, unique names without `@`. Returns [] when the registry is
 * empty — validation is opt-in, so movies that have not assigned any refName are
 * never blocked.
 */
export function findUnregisteredMentions(
  texts: readonly string[],
  registered: readonly string[],
): string[] {
  if (registered.length === 0) return [];
  const known = new Set(registered);
  const unknown = new Set<string>();
  for (const text of texts) {
    for (const name of extractRefMentions(text)) {
      if (!known.has(name)) unknown.add(name);
    }
  }
  return [...unknown].sort();
}
