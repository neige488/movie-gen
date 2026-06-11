/**
 * SceneCopier — clone an existing Scene folder under a new slug.
 *
 * Slice 5 (Light edit). Per CONTEXT.md "Scene model: flat folders +
 * isStarred boolean" and the Director example dialogue, copying a Scene is
 * the canonical way to fork a darker/alternate version while keeping the
 * original's Takes intact. The fork starts with `isStarred=false` so the
 * Director must consciously promote it into the movie sequence.
 *
 * Operation: copy `scene.yaml`, `screenplay.md`, `shots.yaml` from
 * `data/scenes/<sourceSlug>/` to `data/scenes/<newSlug>/`. The scene.yaml's
 * `isStarred` field is forced to `false` while the slugline is preserved
 * verbatim (the Director can edit the slugline afterwards via setSceneSlugline
 * if the variant warrants a new heading).
 *
 * Path safety: newSlug is validated against a kebab-case pattern (the
 * existing fixtures are all kebab-case; this keeps URLs and folder layouts
 * predictable). Path separators, traversal, and uppercase are rejected.
 * Collision with an existing folder is refused — last-write-wins semantics
 * from ADR 0001 apply to *edits*, not to creates.
 */

import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";

export class SceneCopierError extends Error {
  public override readonly name = "SceneCopierError";
}

// kebab-case: starts with a lowercase letter or digit, then [a-z0-9-]+.
// Matches existing fixture slugs (s01-prologue, s03-resolution-alt, etc.).
const KEBAB_SLUG = /^[a-z0-9][a-z0-9-]*$/;

function assertSafeNewSlug(slug: string): void {
  if (!slug) {
    throw new SceneCopierError(`new slug is required`);
  }
  if (slug.includes("/") || slug.includes("\\")) {
    throw new SceneCopierError(
      `new slug must not contain path separators: "${slug}"`,
    );
  }
  if (slug.includes("..")) {
    throw new SceneCopierError(`new slug must not traverse: "${slug}"`);
  }
  if (!KEBAB_SLUG.test(slug)) {
    throw new SceneCopierError(
      `new slug must be kebab-case (lowercase, digits, hyphens; start alphanumeric): "${slug}"`,
    );
  }
}

async function isExistingDir(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isDirectory();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}

/**
 * Copy a Scene folder. Returns nothing — the caller is responsible for
 * rebuilding the in-memory Project (via `loadProject` or by mutating it
 * directly using the domain factories).
 */
export async function copyScene(
  dataDir: string,
  sourceSlug: string,
  newSlug: string,
): Promise<void> {
  if (!sourceSlug) {
    throw new SceneCopierError("source slug is required");
  }
  assertSafeNewSlug(newSlug);
  if (sourceSlug === newSlug) {
    throw new SceneCopierError(
      `new slug must differ from source slug ("${sourceSlug}")`,
    );
  }

  const sourceDir = path.join(dataDir, "scenes", sourceSlug);
  if (!(await isExistingDir(sourceDir))) {
    throw new SceneCopierError(`source scene "${sourceSlug}" does not exist`);
  }

  const targetDir = path.join(dataDir, "scenes", newSlug);
  if (await exists(targetDir)) {
    throw new SceneCopierError(
      `target scene "${newSlug}" already exists — refuse to overwrite`,
    );
  }

  await mkdir(targetDir, { recursive: true });

  // Copy screenplay.md and shots.yaml verbatim. The marker block hashes pinned
  // on each Shot/Take are still valid for the new Scene because we copied the
  // exact same screenplay text — sync evaluator will see the copy as in-sync.
  await copyFile(
    path.join(sourceDir, "screenplay.md"),
    path.join(targetDir, "screenplay.md"),
  );
  await copyFile(
    path.join(sourceDir, "shots.yaml"),
    path.join(targetDir, "shots.yaml"),
  );

  // scene.yaml: parse, force isStarred=false, write back so the fork starts
  // off the movie sequence (CONTEXT.md Scene model). The slugline is
  // preserved — the Director can rename it later via setSceneSlugline if
  // needed.
  const sourceSceneYaml = await readFile(
    path.join(sourceDir, "scene.yaml"),
    "utf8",
  );
  const parsed = yaml.load(sourceSceneYaml) as
    | { slugline?: unknown; isStarred?: unknown }
    | null
    | undefined;
  const slugline = typeof parsed?.slugline === "string" ? parsed.slugline : "";
  if (!slugline) {
    throw new SceneCopierError(
      `source scene "${sourceSlug}" has no slugline — cannot copy`,
    );
  }
  await writeFile(
    path.join(targetDir, "scene.yaml"),
    yaml.dump(
      { slugline, isStarred: false },
      { lineWidth: 120, noRefs: true },
    ),
    "utf8",
  );
}
