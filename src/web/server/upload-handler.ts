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
  Scene,
  Shot,
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
  saveSceneShots: (
    dataDir: string,
    sceneSlug: string,
    shots: readonly Shot[],
  ) => Promise<void>;
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
    case "character-voice":
    case "character-face":
    case "character-body":
    case "character-uniform": {
      const c = project.characters.find((x) => x.name === slot.character);
      if (!c) {
        throw new UploadValidationError(
          `unknown character "${slot.character}"`,
        );
      }
      // Look-scoped slots must point at an existing Look; headshot/voice are
      // character-level and have no `look`.
      if (
        slot.kind === "character-face" ||
        slot.kind === "character-body" ||
        slot.kind === "character-uniform"
      ) {
        if (!c.looks.some((l) => l.name === slot.look)) {
          throw new UploadValidationError(
            `unknown look "${slot.look}" on character "${slot.character}"`,
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
    case "shot-start-frame":
    case "shot-end-frame": {
      // Frame slot must point at an existing Shot in an existing Scene.
      findShot(project, slot.sceneSlug, slot.shotId);
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
    case "character-voice":
    case "character-face":
    case "character-body":
    case "character-uniform": {
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
    case "shot-start-frame":
    case "shot-end-frame": {
      const { scene, shot } = findShot(
        project,
        slot.sceneSlug,
        slot.shotId,
      );
      const field = slot.kind === "shot-start-frame" ? "startFrame" : "endFrame";
      // Patch only the image path; preserve any existing prompt on the frame.
      const updatedShot: Shot = {
        ...shot,
        [field]: { ...shot[field], image: relativePath },
      };
      const updatedShots = scene.shots.map((s) =>
        s.id === shot.id ? updatedShot : s,
      );
      await deps.saveSceneShots(deps.dataDir, scene.slug, updatedShots);
      const scenes = project.scenes.map((s) =>
        s.slug === scene.slug ? { ...scene, shots: updatedShots } : s,
      );
      return rebuildProject(deps, { ...project, scenes });
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

function findShot(
  project: Project,
  sceneSlug: string,
  shotId: string,
): { scene: Scene; shot: Shot } {
  const scene = project.scenes.find((s) => s.slug === sceneSlug);
  if (!scene) throw new UploadValidationError(`unknown scene "${sceneSlug}"`);
  const shot = scene.shots.find((s) => s.id === shotId);
  if (!shot) {
    throw new UploadValidationError(
      `unknown shot "${shotId}" in scene "${sceneSlug}"`,
    );
  }
  return { scene, shot };
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
    {
      kind:
        | "character-headshot"
        | "character-voice"
        | "character-face"
        | "character-body"
        | "character-uniform";
    }
  >,
  relativePath: string,
): Character {
  // Patch only the image/video path; preserve refName/name/prompt on the ref.
  if (slot.kind === "character-headshot") {
    return { ...c, headshot: { ...c.headshot, image: relativePath } };
  }
  if (slot.kind === "character-voice") {
    // Sets the voice VIDEO path; creates the voice ref if absent. Preserves
    // any existing refName/prompt/blackVideo.
    return { ...c, voice: { ...c.voice, video: relativePath } };
  }
  const looks = c.looks.map((l) => {
    if (l.name !== slot.look) return l;
    if (slot.kind === "character-face")
      return { ...l, face: { ...l.face, image: relativePath } };
    if (slot.kind === "character-body")
      return { ...l, body: { ...l.body, image: relativePath } };
    // character-uniform — creates the uniform ImageRef if the look had none.
    return { ...l, uniform: { ...l.uniform, image: relativePath } };
  });
  return { ...c, looks };
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
