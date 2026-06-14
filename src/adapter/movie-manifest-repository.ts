/**
 * MovieManifestRepository — load/save the Scene-ordering manifest
 * (`data/movie.yaml`).
 *
 * Per ADR 0002, `data/movie.yaml` is the single source of truth for Scene
 * order + Act placement. This adapter is the only boundary between that file
 * and the `MovieArrangement` domain aggregate. It owns three responsibilities
 * the ADR calls out:
 *
 *   1. Migration  — if the manifest is absent, build one by dropping every
 *      existing Scene folder into act 1 (folder-slug order).
 *   2. Reconcile  — on load, fix drift between the manifest and the actual
 *      Scene folders: folders missing from the manifest are appended to the
 *      end of act 1; manifest slugs with no folder (dangling) are dropped.
 *   3. Atomic write — `saveArrangement` writes to a temp file then renames
 *      over the target so a crash mid-write can never leave a half-written
 *      manifest (rename is atomic on the same filesystem).
 *
 * The on-disk shape:
 *
 *   acts:
 *     - id: 1
 *       scenes: [s01-prologue]
 *     - id: 2
 *       scenes: [s02-confrontation]
 *     - id: 3
 *       scenes: [s03-resolution-alt]
 *
 * Mirrors ProjectRepository's two-tier validation: a Zod schema checks the
 * structural shape, then the domain factory (`createMovieArrangement`) enforces
 * the deeper invariants (acts 1/2/3 in order, no duplicate slug). Both surface
 * as MovieManifestError naming `movie.yaml`.
 */

import { readFile, readdir, rename, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { z, ZodError } from "zod";
import {
  createMovieArrangement,
  migrateArrangement,
  reconcileArrangement,
  MovieArrangementError,
  type ActId,
  type MovieArrangement,
} from "@domain/movie-arrangement.js";

export class MovieManifestError extends Error {
  public override readonly name = "MovieManifestError";
}

const MANIFEST_FILENAME = "movie.yaml";

const actFileSchema = z.object({
  id: z.number().int(),
  scenes: z.array(z.string().min(1)).default([]),
});

const manifestFileSchema = z.object({
  acts: z.array(actFileSchema),
});

/**
 * Load the arrangement for `dataDir`. Reads `movie.yaml` if present (migrating
 * if absent), then reconciles against the actual `scenes/<slug>/` folders.
 *
 * Read-only: never writes the manifest as a side effect (the caller persists
 * the reconciled arrangement explicitly when it wants the drift fixed on
 * disk).
 */
export async function loadArrangement(
  dataDir: string,
): Promise<MovieArrangement> {
  const folderSlugs = await listSceneSlugs(path.join(dataDir, "scenes"));
  const manifestPath = path.join(dataDir, MANIFEST_FILENAME);

  let raw: unknown;
  try {
    const text = await readFile(manifestPath, "utf8");
    try {
      raw = yaml.load(text);
    } catch (err) {
      throw new MovieManifestError(
        `[${MANIFEST_FILENAME}] invalid YAML: ${(err as Error).message}`,
      );
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      // No manifest — migrate every existing Scene into act 1.
      return migrateArrangement(folderSlugs);
    }
    if (err instanceof MovieManifestError) throw err;
    throw new MovieManifestError(
      `[${MANIFEST_FILENAME}] could not read manifest: ${(err as Error).message}`,
    );
  }

  let parsed: z.infer<typeof manifestFileSchema>;
  try {
    parsed = manifestFileSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) {
      const summary = err.errors
        .map((e) => `${e.path.join(".") || "<root>"}: ${e.message}`)
        .join("; ");
      throw new MovieManifestError(
        `[${MANIFEST_FILENAME}] schema error: ${summary}`,
      );
    }
    throw err;
  }

  let manifest: MovieArrangement;
  try {
    manifest = createMovieArrangement(
      parsed.acts.map((a) => ({ id: a.id as ActId, scenes: a.scenes })),
    );
  } catch (err) {
    if (err instanceof MovieArrangementError) {
      throw new MovieManifestError(`[${MANIFEST_FILENAME}] ${err.message}`);
    }
    throw err;
  }

  // Reconcile manifest ↔ folders (orphan append / dangling drop). reconcile
  // re-validates via createMovieArrangement; surface any breach as a manifest
  // error too.
  try {
    return reconcileArrangement(manifest, folderSlugs);
  } catch (err) {
    if (err instanceof MovieArrangementError) {
      throw new MovieManifestError(
        `[${MANIFEST_FILENAME}] reconcile failed: ${err.message}`,
      );
    }
    throw err;
  }
}

/**
 * Persist the arrangement to `data/movie.yaml` with an atomic write: serialize,
 * write to a sibling temp file, then rename over the target. Per ADR 0001,
 * last-write-wins (single-user assumption) — but the rename guarantees the
 * file is never observed half-written.
 */
export async function saveArrangement(
  dataDir: string,
  arrangement: MovieArrangement,
): Promise<void> {
  const payload = {
    acts: arrangement.toActs().map((a) => ({ id: a.id, scenes: [...a.scenes] })),
  };
  const text = yaml.dump(payload, { lineWidth: 120, noRefs: true });

  const target = path.join(dataDir, MANIFEST_FILENAME);
  const tmp = path.join(dataDir, `.${MANIFEST_FILENAME}.${process.pid}.tmp`);
  await writeFile(tmp, text, "utf8");
  await rename(tmp, target);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * List the Scene folder slugs under `scenesDir`, sorted for a deterministic
 * boot/migration order. Mirrors ProjectRepository's "only directories count"
 * rule and tolerates a missing scenes/ directory (returns []).
 */
async function listSceneSlugs(scenesDir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(scenesDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const slugs: string[] = [];
  for (const entry of entries) {
    const s = await stat(path.join(scenesDir, entry));
    if (s.isDirectory()) slugs.push(entry);
  }
  return slugs.sort((a, b) => a.localeCompare(b));
}
