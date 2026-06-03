/**
 * Upload handler — the domain-aware orchestrator.
 *
 * Given an AssetSlot + bytes:
 *  1. Calls AssetStore.upload to write the binary, getting a relative path.
 *  2. Locates the target domain object (character/location/prop) and patches
 *     the matching image field with that relative path.
 *  3. Persists the patched object back to YAML via the appropriate save* fn.
 *  4. Rebuilds the Project aggregate (re-validates ref integrity) and returns
 *     the new project + relative path.
 *
 * Dependencies are injected so this module stays unit-testable end-to-end
 * with a real temp filesystem (see upload-handler.test.ts).
 *
 * The handler never directly touches the filesystem — it delegates writes to
 * AssetStore (binaries) and saveX (yaml).
 */

import type {
  Character,
  Location,
  Project,
  Prop,
} from "@domain/movie.js";
import type { AssetStore, AssetSlot } from "@adapter/asset-store.js";

export interface UploadCommand {
  slot: AssetSlot;
  originalFilename: string;
  data: Buffer;
}

export interface ApplyUploadDeps {
  project: Project;
  command: UploadCommand;
  assetStore: AssetStore;
  dataDir: string;
  saveCharacter: (dataDir: string, c: Character) => Promise<void>;
  saveLocation: (dataDir: string, l: Location) => Promise<void>;
  saveProp: (dataDir: string, p: Prop) => Promise<void>;
  createProject: (input: {
    scenes: readonly Project["scenes"][number][];
    characters: readonly Character[];
    locations: readonly Location[];
    props: readonly Prop[];
  }) => Project;
}

export interface UploadResult {
  relativePath: string;
  project: Project;
}

export class UploadValidationError extends Error {
  public override readonly name = "UploadValidationError";
}

export async function applyUpload(deps: ApplyUploadDeps): Promise<UploadResult> {
  const { project, command, assetStore } = deps;

  // First validate that the slot's target object exists in the project. This
  // prevents an orphan asset write if the user requests upload for a Character
  // we don't know about.
  validateSlotTarget(project, command.slot);

  const relativePath = await assetStore.upload(
    command.slot,
    command.originalFilename,
    command.data,
  );

  const next = await applySlotToProject(project, command.slot, relativePath, deps);
  return { relativePath, project: next };
}

function validateSlotTarget(project: Project, slot: AssetSlot): void {
  switch (slot.kind) {
    case "character-headshot":
    case "character-face":
    case "character-body": {
      const c = project.characters.find((x) => x.name === slot.character);
      if (!c) {
        throw new UploadValidationError(
          `unknown character "${slot.character}"`,
        );
      }
      if (slot.kind !== "character-headshot") {
        const look = c.looks.find((l) => l.name === slot.look);
        if (!look) {
          throw new UploadValidationError(
            `unknown look "${slot.look}" on character "${slot.character}"`,
          );
        }
        // Validate the slot index against the *actual* profile length before
        // any file is written. This rejects out-of-range targets up front (no
        // orphan binary) and — unlike the AssetStore's fixed 5/3 check —
        // guards against a profile that somehow holds fewer images than
        // expected, which would otherwise make mutateCharacter write a sparse
        // array (null holes → reload failure).
        const images =
          slot.kind === "character-face"
            ? look.faceProfile.images
            : look.bodyProfile.images;
        const label = slot.kind === "character-face" ? "face" : "body";
        if (
          !Number.isInteger(slot.index) ||
          slot.index < 0 ||
          slot.index >= images.length
        ) {
          throw new UploadValidationError(
            `${label} slot index ${slot.index} is out of range for look "${slot.look}" (has ${images.length} images)`,
          );
        }
      }
      return;
    }
    case "location-ref": {
      const l = project.locations.find((x) => x.name === slot.location);
      if (!l) {
        throw new UploadValidationError(
          `unknown location "${slot.location}"`,
        );
      }
      if (!l.references.some((r) => r.name === slot.refName)) {
        throw new UploadValidationError(
          `unknown reference "${slot.refName}" on location "${slot.location}"`,
        );
      }
      return;
    }
    case "prop-ref": {
      const p = project.props.find((x) => x.name === slot.prop);
      if (!p) {
        throw new UploadValidationError(`unknown prop "${slot.prop}"`);
      }
      if (!p.references.some((r) => r.name === slot.refName)) {
        throw new UploadValidationError(
          `unknown reference "${slot.refName}" on prop "${slot.prop}"`,
        );
      }
      return;
    }
    case "take-video": {
      // Takes go through their dedicated orchestrator (take-upload-handler).
      // Reject here so a misrouted request fails fast with a clear message.
      throw new UploadValidationError(
        `take-video slot must use POST /api/takes/upload, not /api/assets/upload`,
      );
    }
    default: {
      const exhaustive: never = slot;
      throw new UploadValidationError(
        `unknown slot kind ${JSON.stringify(exhaustive)}`,
      );
    }
  }
}

async function applySlotToProject(
  project: Project,
  slot: AssetSlot,
  relativePath: string,
  deps: ApplyUploadDeps,
): Promise<Project> {
  switch (slot.kind) {
    case "character-headshot":
    case "character-face":
    case "character-body": {
      const updatedChar = mutateCharacter(
        findCharacter(project, slot.character),
        slot,
        relativePath,
      );
      const characters = project.characters.map((c) =>
        c.name === updatedChar.name ? updatedChar : c,
      );
      await deps.saveCharacter(deps.dataDir, updatedChar);
      return rebuildProject(deps, { ...project, characters });
    }
    case "location-ref": {
      const updatedLoc = mutateLocation(
        findLocation(project, slot.location),
        slot.refName,
        relativePath,
      );
      const locations = project.locations.map((l) =>
        l.name === updatedLoc.name ? updatedLoc : l,
      );
      await deps.saveLocation(deps.dataDir, updatedLoc);
      return rebuildProject(deps, { ...project, locations });
    }
    case "prop-ref": {
      const updatedProp = mutateProp(
        findProp(project, slot.prop),
        slot.refName,
        relativePath,
      );
      const props = project.props.map((p) =>
        p.name === updatedProp.name ? updatedProp : p,
      );
      await deps.saveProp(deps.dataDir, updatedProp);
      return rebuildProject(deps, { ...project, props });
    }
    case "take-video": {
      // Unreachable — validateSlotTarget rejects this slot kind upstream.
      throw new UploadValidationError(
        `take-video slot must use POST /api/takes/upload, not /api/assets/upload`,
      );
    }
    default: {
      const exhaustive: never = slot;
      throw new UploadValidationError(
        `unhandled slot ${JSON.stringify(exhaustive)}`,
      );
    }
  }
}

function findCharacter(project: Project, name: string): Character {
  const c = project.characters.find((x) => x.name === name);
  if (!c) throw new UploadValidationError(`unknown character "${name}"`);
  return c;
}

function findLocation(project: Project, name: string): Location {
  const l = project.locations.find((x) => x.name === name);
  if (!l) throw new UploadValidationError(`unknown location "${name}"`);
  return l;
}

function findProp(project: Project, name: string): Prop {
  const p = project.props.find((x) => x.name === name);
  if (!p) throw new UploadValidationError(`unknown prop "${name}"`);
  return p;
}

function mutateCharacter(
  c: Character,
  slot: Extract<
    AssetSlot,
    { kind: "character-headshot" | "character-face" | "character-body" }
  >,
  relativePath: string,
): Character {
  if (slot.kind === "character-headshot") {
    return { ...c, headshot: relativePath };
  }
  const looks = c.looks.map((l) => {
    if (l.name !== slot.look) return l;
    if (slot.kind === "character-face") {
      return {
        ...l,
        faceProfile: {
          images: setImageAt(l.faceProfile.images, slot.index, relativePath, "face"),
        },
      };
    } else {
      return {
        ...l,
        bodyProfile: {
          images: setImageAt(l.bodyProfile.images, slot.index, relativePath, "body"),
        },
      };
    }
  });
  return { ...c, looks };
}

/**
 * Replace the image at `index`, returning a dense copy. Throws rather than
 * assigning past the end — `arr[i] = x` on an out-of-bounds index silently
 * creates a sparse array (holes serialize to `null` and fail schema reload).
 * `validateSlotTarget` already range-checks against the live project, so this
 * is defense-in-depth for any future caller.
 */
function setImageAt(
  images: readonly string[],
  index: number,
  value: string,
  label: string,
): string[] {
  if (!Number.isInteger(index) || index < 0 || index >= images.length) {
    throw new UploadValidationError(
      `${label} slot index ${index} is out of range (profile has ${images.length} images)`,
    );
  }
  const next = [...images];
  next[index] = value;
  return next;
}

function mutateLocation(
  l: Location,
  refName: string,
  relativePath: string,
): Location {
  const references = l.references.map((r) =>
    r.name === refName ? { ...r, image: relativePath } : r,
  );
  return { ...l, references };
}

function mutateProp(p: Prop, refName: string, relativePath: string): Prop {
  const references = p.references.map((r) =>
    r.name === refName ? { ...r, image: relativePath } : r,
  );
  return { ...p, references };
}

function rebuildProject(
  deps: ApplyUploadDeps,
  next: {
    scenes: Project["scenes"];
    characters: readonly Character[];
    locations: readonly Location[];
    props: readonly Prop[];
  },
): Project {
  return deps.createProject({
    scenes: [...next.scenes],
    characters: [...next.characters],
    locations: [...next.locations],
    props: [...next.props],
  });
}
