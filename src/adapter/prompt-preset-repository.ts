/**
 * PromptPresetRepository — load the movie-level prompt preset
 * (`data/prompt-preset.yaml`).
 *
 * The preset holds the common prompt affixes (prefix/suffix) and the ref-line
 * templates used to assemble each Shot's final copy-paste prompt (see
 * `@domain/prompt-preset`). It is a single movie-level file, separate from the
 * Scene-ordering manifest (`movie.yaml`) since it is a different concern.
 *
 * Mirrors the rest of the adapter layer's two-tier validation: a Zod schema
 * checks the structural shape, then `createPromptPreset` fills defaults. Unlike
 * the project/manifest loaders, an ABSENT or EMPTY file is valid — it just
 * yields the identity preset (empty affixes + default ref templates) so movies
 * that have not configured a preset keep working. A file that exists but is
 * malformed (bad YAML / wrong types) fails loudly, per no-silent-fallback.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { z, ZodError } from "zod";
import { createPromptPreset, type PromptPreset } from "@domain/prompt-preset.js";
import { promptPresetFileSchema } from "./schemas.js";

export class PromptPresetError extends Error {
  public override readonly name = "PromptPresetError";
}

const PRESET_FILENAME = "prompt-preset.yaml";

/**
 * Load the prompt preset for `dataDir`. Returns the identity preset when the
 * file is absent or empty; throws PromptPresetError (naming the file) on
 * unreadable / invalid-YAML / schema-mismatch.
 */
export async function loadPromptPreset(dataDir: string): Promise<PromptPreset> {
  const presetPath = path.join(dataDir, PRESET_FILENAME);

  let text: string;
  try {
    text = await readFile(presetPath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return createPromptPreset({});
    }
    throw new PromptPresetError(
      `[${PRESET_FILENAME}] could not read preset: ${(err as Error).message}`,
    );
  }

  let raw: unknown;
  try {
    raw = yaml.load(text);
  } catch (err) {
    throw new PromptPresetError(
      `[${PRESET_FILENAME}] invalid YAML: ${(err as Error).message}`,
    );
  }

  // Empty file (yaml.load → null/undefined) behaves as "no preset".
  if (raw == null) return createPromptPreset({});

  let parsed: z.infer<typeof promptPresetFileSchema>;
  try {
    parsed = promptPresetFileSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) {
      const summary = err.errors
        .map((e) => `${e.path.join(".") || "<root>"}: ${e.message}`)
        .join("; ");
      throw new PromptPresetError(
        `[${PRESET_FILENAME}] schema error: ${summary}`,
      );
    }
    throw err;
  }

  return createPromptPreset({
    prefix: parsed.prefix,
    suffix: parsed.suffix,
  });
}
