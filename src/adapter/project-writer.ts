/**
 * ProjectWriter — write domain objects back to YAML files under `data/`.
 *
 * Complements ProjectRepository's load functions. Only Character/Location/Prop
 * are writable in slice #2 (other domain objects come in later slices).
 *
 * Path layout (mirrors ProjectRepository):
 *   data/characters/<name>.yaml
 *   data/locations/<name>.yaml
 *   data/props/<name>.yaml
 *
 * Per ADR 0001, last-write-wins. Single-user assumption — no locking.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import type { Character, Location, Prop } from "@domain/movie.js";

export async function saveCharacter(
  dataDir: string,
  character: Character,
): Promise<void> {
  const dir = path.join(dataDir, "characters");
  await mkdir(dir, { recursive: true });
  const payload = {
    name: character.name,
    headshot: character.headshot,
    looks: character.looks.map((l) => ({
      name: l.name,
      bodyProfile: { images: [...l.bodyProfile.images] },
      faceProfile: { images: [...l.faceProfile.images] },
    })),
  };
  await writeFile(
    path.join(dir, `${character.name}.yaml`),
    yaml.dump(payload, { lineWidth: 120, noRefs: true }),
    "utf8",
  );
}

export async function saveLocation(
  dataDir: string,
  location: Location,
): Promise<void> {
  const dir = path.join(dataDir, "locations");
  await mkdir(dir, { recursive: true });
  const payload = {
    name: location.name,
    references: location.references.map((r) => ({
      name: r.name,
      prompt: r.prompt,
      image: r.image,
    })),
  };
  await writeFile(
    path.join(dir, `${location.name}.yaml`),
    yaml.dump(payload, { lineWidth: 120, noRefs: true }),
    "utf8",
  );
}

export async function saveProp(dataDir: string, prop: Prop): Promise<void> {
  const dir = path.join(dataDir, "props");
  await mkdir(dir, { recursive: true });
  const payload = {
    name: prop.name,
    references: prop.references.map((r) => ({
      name: r.name,
      prompt: r.prompt,
      image: r.image,
    })),
  };
  await writeFile(
    path.join(dir, `${prop.name}.yaml`),
    yaml.dump(payload, { lineWidth: 120, noRefs: true }),
    "utf8",
  );
}
