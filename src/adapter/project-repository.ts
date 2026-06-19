/**
 * ProjectRepository — loads a Project from `data/` on disk.
 *
 * Per ADR 0001: YAML + Markdown is the source of truth. This adapter is the
 * single boundary between filesystem and domain. All structural validation
 * (schema) and domain invariants (factories) run here at boot — failures
 * surface as ProjectLoadError with the offending file and field path.
 *
 * Layout (relative to dataDir):
 *   scenes/<slug>/scene.yaml        — slugline, isStarred
 *   scenes/<slug>/screenplay.md     — markdown body with shot markers
 *   scenes/<slug>/shots.yaml        — shots array
 *   characters/<name>.yaml          — character (optional dir)
 *   locations/<name>.yaml           — location (optional dir)
 *   props/<name>.yaml               — prop (optional dir)
 */

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { ZodError } from "zod";
import {
  DomainInvariantError,
  createCharacter,
  createLocation,
  createLook,
  createProject,
  createProp,
  createScene,
  createShot,
  createTake,
  type Project,
  type Character,
  type Location,
  type Prop,
  type Scene,
} from "@domain/movie.js";
import { parseShotMarkers } from "@domain/marker-parser.js";
import { loadArrangement } from "./movie-manifest-repository.js";
import {
  characterFileSchema,
  locationFileSchema,
  propFileSchema,
  sceneFileSchema,
  shotsFileSchema,
} from "./schemas.js";

export class ProjectLoadError extends Error {
  public override readonly name = "ProjectLoadError";
  public readonly file?: string;

  constructor(message: string, file?: string) {
    super(file ? `[${file}] ${message}` : message);
    if (file !== undefined) this.file = file;
  }
}

export async function loadProject(dataDir: string): Promise<Project> {
  // Validate the dataDir exists.
  try {
    const s = await stat(dataDir);
    if (!s.isDirectory()) {
      throw new ProjectLoadError(`not a directory: ${dataDir}`);
    }
  } catch (err) {
    if (err instanceof ProjectLoadError) throw err;
    throw new ProjectLoadError(
      `data directory not found: ${dataDir} (${(err as Error).message})`,
    );
  }

  const scenes = await loadScenes(path.join(dataDir, "scenes"));
  const characters = await loadCharacters(path.join(dataDir, "characters"));
  const locations = await loadLocations(path.join(dataDir, "locations"));
  const props = await loadProps(path.join(dataDir, "props"));

  // Scene ORDER is owned by the manifest (ADR 0002), not the folder-name
  // prefix. Load the arrangement (migrating + reconciling on the way) and
  // sort the scenes into its linear sequence so every consumer — /api/movie,
  // the sidebar's allScenes, dto-mapper — agrees with the single SSOT.
  const arrangement = await loadArrangement(dataDir);
  const orderedScenes = orderByArrangement(scenes, arrangement);

  try {
    return createProject({
      scenes: orderedScenes,
      characters,
      locations,
      props,
    });
  } catch (err) {
    if (err instanceof DomainInvariantError) {
      throw new ProjectLoadError(`reference integrity: ${err.message}`);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------

async function loadScenes(scenesDir: string): Promise<Scene[]> {
  const entries = await readDirSafe(scenesDir);
  const scenes: Scene[] = [];
  for (const entry of entries) {
    const sceneDir = path.join(scenesDir, entry);
    const s = await stat(sceneDir);
    if (!s.isDirectory()) continue;
    scenes.push(await loadScene(entry, sceneDir));
  }
  // No slug-prefix sort here (ADR 0002 — the folder prefix no longer owns
  // order). loadProject reorders the scenes by the manifest's linear sequence
  // via orderByArrangement.
  return scenes;
}

/**
 * Reorder loaded scenes to follow the arrangement's linear sequence
 * (act1 ++ act2 ++ act3 flatten). The arrangement is already reconciled
 * against the folders (orphan folders appended to act 1, dangling slugs
 * dropped) so every loaded slug should appear in the sequence; any scene that
 * somehow isn't placed is appended at the end (deterministic, by slug) so we
 * never silently drop a Scene the repository read from disk.
 */
function orderByArrangement(
  scenes: readonly Scene[],
  arrangement: { linearSequence(): readonly string[] },
): Scene[] {
  const bySlug = new Map(scenes.map((s) => [s.slug, s]));
  const ordered: Scene[] = [];
  const placed = new Set<string>();
  for (const slug of arrangement.linearSequence()) {
    const scene = bySlug.get(slug);
    if (scene && !placed.has(slug)) {
      ordered.push(scene);
      placed.add(slug);
    }
  }
  // Safety net: any scene not in the sequence (shouldn't happen post-reconcile).
  const leftovers = scenes
    .filter((s) => !placed.has(s.slug))
    .sort((a, b) => a.slug.localeCompare(b.slug));
  return [...ordered, ...leftovers];
}

async function loadScene(slug: string, sceneDir: string): Promise<Scene> {
  const sceneYamlPath = path.join(sceneDir, "scene.yaml");
  const screenplayPath = path.join(sceneDir, "screenplay.md");
  const shotsYamlPath = path.join(sceneDir, "shots.yaml");

  const sceneRaw = await parseYamlFile(sceneYamlPath);
  const sceneFile = parseWithSchema(sceneFileSchema, sceneRaw, sceneYamlPath);

  const screenplay = await readTextFile(screenplayPath);

  // Validate markers (will throw with line numbers if malformed).
  try {
    parseShotMarkers(screenplay);
  } catch (err) {
    throw new ProjectLoadError((err as Error).message, screenplayPath);
  }

  const shotsRaw = await parseYamlFile(shotsYamlPath);
  const shotsFile = parseWithSchema(shotsFileSchema, shotsRaw, shotsYamlPath);

  const shots = shotsFile.shots.map((sf) => {
    try {
      return createShot({
        id: sf.id,
        prompt: sf.prompt,
        duration: sf.duration,
        screenplayHash: sf.screenplayHash,
        prevShotRef: sf.prevShotRef,
        characterRefs: sf.characterRefs,
        locationRefs: sf.locationRefs.map((l) => ({
          location: l.location,
          reference: l.reference,
        })),
        propRefs: sf.propRefs.map((p) => ({
          prop: p.prop,
          reference: p.reference,
        })),
        takes: sf.takes.map((t) =>
          createTake({
            id: t.id,
            videoPath: t.videoPath,
            screenplayHash: t.screenplayHash,
            createdAt: t.createdAt,
            isStarred: t.isStarred,
          }),
        ),
      });
    } catch (err) {
      if (err instanceof DomainInvariantError) {
        throw new ProjectLoadError(
          `scene "${slug}" — ${err.message}`,
          shotsYamlPath,
        );
      }
      throw err;
    }
  });

  try {
    return createScene({
      slug,
      slugline: sceneFile.slugline,
      screenplay,
      isStarred: sceneFile.isStarred,
      shots,
    });
  } catch (err) {
    if (err instanceof DomainInvariantError) {
      throw new ProjectLoadError(err.message, sceneDir);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Characters / Locations / Props
// ---------------------------------------------------------------------------

async function loadCharacters(dir: string): Promise<Character[]> {
  const entries = await readDirSafe(dir);
  const characters: Character[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".yaml") && !entry.endsWith(".yml")) continue;
    const filePath = path.join(dir, entry);
    const raw = await parseYamlFile(filePath);
    const file = parseWithSchema(characterFileSchema, raw, filePath);
    try {
      const looks = file.looks.map((l) =>
        createLook({
          name: l.name,
          face: l.face,
          body: l.body,
          ...(l.uniform !== undefined ? { uniform: l.uniform } : {}),
        }),
      );
      characters.push(
        createCharacter({
          name: file.name,
          headshot: file.headshot,
          looks,
        }),
      );
    } catch (err) {
      if (err instanceof DomainInvariantError) {
        throw new ProjectLoadError(err.message, filePath);
      }
      throw err;
    }
  }
  return characters.sort((a, b) => a.name.localeCompare(b.name));
}

async function loadLocations(dir: string): Promise<Location[]> {
  const entries = await readDirSafe(dir);
  const locations: Location[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".yaml") && !entry.endsWith(".yml")) continue;
    const filePath = path.join(dir, entry);
    const raw = await parseYamlFile(filePath);
    const file = parseWithSchema(locationFileSchema, raw, filePath);
    try {
      locations.push(
        createLocation({ name: file.name, references: file.references }),
      );
    } catch (err) {
      if (err instanceof DomainInvariantError) {
        throw new ProjectLoadError(err.message, filePath);
      }
      throw err;
    }
  }
  return locations.sort((a, b) => a.name.localeCompare(b.name));
}

async function loadProps(dir: string): Promise<Prop[]> {
  const entries = await readDirSafe(dir);
  const props: Prop[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".yaml") && !entry.endsWith(".yml")) continue;
    const filePath = path.join(dir, entry);
    const raw = await parseYamlFile(filePath);
    const file = parseWithSchema(propFileSchema, raw, filePath);
    try {
      props.push(createProp({ name: file.name, references: file.references }));
    } catch (err) {
      if (err instanceof DomainInvariantError) {
        throw new ProjectLoadError(err.message, filePath);
      }
      throw err;
    }
  }
  return props.sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// fs helpers
// ---------------------------------------------------------------------------

async function readDirSafe(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir);
    return entries;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }
}

async function readTextFile(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch (err) {
    throw new ProjectLoadError(
      `could not read file (${(err as Error).message})`,
      filePath,
    );
  }
}

async function parseYamlFile(filePath: string): Promise<unknown> {
  const text = await readTextFile(filePath);
  try {
    return yaml.load(text);
  } catch (err) {
    throw new ProjectLoadError(
      `invalid YAML: ${(err as Error).message}`,
      filePath,
    );
  }
}

function parseWithSchema<T>(
  schema: { parse: (data: unknown) => T },
  data: unknown,
  filePath: string,
): T {
  try {
    return schema.parse(data);
  } catch (err) {
    if (err instanceof ZodError) {
      const summary = err.errors
        .map((e) => `${e.path.join(".") || "<root>"}: ${e.message}`)
        .join("; ");
      throw new ProjectLoadError(`schema error: ${summary}`, filePath);
    }
    throw err;
  }
}
