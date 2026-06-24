/**
 * PromptPreset — movie-level prompt scaffolding.
 *
 * The tool does not call the video engine (씨댄스/Runway); the director copies a
 * Shot's prompt into the engine by hand. To avoid retyping the boilerplate
 * ("cinematic 4K …") and the negative constraints on every Shot, a single
 * movie-level preset holds three slots, each a distinct concern:
 *  - `prefix`: common text prepended to EVERY Shot prompt, regardless of look.
 *  - `suffix`: common negatives appended to EVERY Shot prompt.
 *  - `looks`:  named camera/film/grade packages (a `look` -> full-prefix map).
 *    A Scene/Shot picks one by its `look` key; the package is inserted BETWEEN
 *    prefix and body. The reserved key `default` applies to Scenes/Shots that
 *    declare no `look`. `looks` is generic: the tool never hard-codes any key
 *    name (e.g. fantasy/reality) — those live in the movie's data.
 *
 * Layering rationale: prefix and a look are DIFFERENT slots (both can apply);
 * a look does NOT replace prefix. Empty `looks` ⇒ legacy behaviour (prefix →
 * body → suffix), so existing movies are untouched.
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

/** Reserved `looks` key applied to a Scene/Shot that declares no `look`. */
export const DEFAULT_LOOK_KEY = "default";

export interface PromptPreset {
  readonly prefix: string;
  readonly suffix: string;
  /** Named camera/film/grade packages — `look` key -> full prefix text. */
  readonly looks: Readonly<Record<string, string>>;
}

export interface CreatePromptPresetInput {
  prefix?: string;
  suffix?: string;
  looks?: Record<string, string>;
}

/**
 * Build a PromptPreset. Every field is optional on disk — missing affixes
 * default to empty and `looks` defaults to `{}` (so an absent file behaves as
 * "no common prompt, no looks").
 */
export function createPromptPreset(input: CreatePromptPresetInput): PromptPreset {
  return {
    prefix: input.prefix ?? "",
    suffix: input.suffix ?? "",
    looks: input.looks ?? {},
  };
}

/**
 * Assemble the copy-paste prompt the director pastes into the engine:
 *   prefix → looks[look] → Shot.prompt → suffix
 * The look package is chosen by `look` (typically `shot.look ?? scene.look`);
 * when omitted, the reserved `default` look applies. A missing look key
 * contributes nothing (the boot-time `findUnregisteredLooks` check rejects
 * unknown keys loudly, so this only no-ops for legacy empty `looks`).
 * Empty sections are omitted; sections are joined by a blank line. The Shot
 * prompt body carries its own inline `@name` refs, so no ref block is appended.
 * Pure — only the Shot, the preset, and the resolved look are needed.
 */
export function assembleFinalPrompt(
  shot: Shot,
  preset: PromptPreset,
  look?: string,
): string {
  const key = look ?? DEFAULT_LOOK_KEY;
  const lookPackage = preset.looks[key] ?? "";
  return [preset.prefix, lookPackage, shot.prompt, preset.suffix]
    .map((s) => s.trim())
    .filter((s) => s !== "")
    .join("\n\n");
}

/**
 * Find `look` keys used by Scenes/Shots that are NOT defined in the preset's
 * `looks` map. Mirrors `findUnregisteredMentions`: opt-in — when the preset
 * defines no `looks`, validation is skipped (returns []), so movies that never
 * configured looks are never blocked. Returns sorted, unique unknown keys.
 */
export function findUnregisteredLooks(
  looksUsed: readonly (string | undefined)[],
  registered: readonly string[],
): string[] {
  if (registered.length === 0) return [];
  const known = new Set(registered);
  const unknown = new Set<string>();
  for (const look of looksUsed) {
    if (look !== undefined && !known.has(look)) unknown.add(look);
  }
  return [...unknown].sort();
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
