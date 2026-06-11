/**
 * ScreenplayWriter — writes `screenplay.md` for one Scene.
 *
 * Slice 5 (Light edit). Per PRD Implementation Decisions, the screenplay
 * writer is its own adapter module separate from `project-writer.ts` because:
 *  - The screenplay file is markdown (not YAML), distinct serialization.
 *  - The Light edit flow validates HTML comment marker consistency *before*
 *    writing — that policy is a domain concern (lives in
 *    `marker-parser.ts::validateMarkerConsistency`), and the writer is the
 *    boundary that enforces it on the filesystem path. Keeping it isolated
 *    here makes the dependency between marker validation and persistence
 *    explicit.
 *
 * The writer does NOT touch `scene.yaml` or `shots.yaml` — only the screenplay
 * file. Marker validation is the *caller*'s responsibility (the HTTP
 * orchestrator); this module exposes a single low-level write so unit tests
 * stay focused on filesystem behavior, and the higher-level orchestrator
 * (screenplay-edit-handler) chains validation + write.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export class ScreenplayWriterError extends Error {
  public override readonly name = "ScreenplayWriterError";
}

const SAFE_SLUG = /^[a-zA-Z0-9_.-]+$/;

function assertSafeSlug(slug: string): void {
  if (!slug) {
    throw new ScreenplayWriterError(`scene slug is required`);
  }
  if (slug.includes("/") || slug.includes("\\") || slug.includes("..")) {
    throw new ScreenplayWriterError(
      `scene slug must not traverse: "${slug}"`,
    );
  }
  if (!SAFE_SLUG.test(slug)) {
    throw new ScreenplayWriterError(
      `scene slug contains illegal characters: "${slug}"`,
    );
  }
}

/**
 * Persist a Scene's `screenplay.md`. Creates the Scene directory if missing
 * (defensive — normally already present from `scene.yaml`). Returns nothing
 * — the in-memory Project is the caller's responsibility (rebuild via
 * `createProject` after this resolves).
 */
export async function saveScreenplay(
  dataDir: string,
  sceneSlug: string,
  markdown: string,
): Promise<void> {
  assertSafeSlug(sceneSlug);
  const dir = path.join(dataDir, "scenes", sceneSlug);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "screenplay.md"), markdown, "utf8");
}
