/**
 * MovieDomain — domain types and factories with invariant enforcement.
 *
 * Vocabulary anchored to CONTEXT.md. No new terms introduced here.
 *
 * Design: factory functions (`createX`) validate invariants on construction
 * and return readonly records. The factories are the only legal way to
 * build domain objects — repository code calls them after YAML parsing.
 *
 * Invariants enforced:
 * - Shot.duration ∈ [4, 15] integer seconds (씨댄스 2.0 engine limit)
 * - Shot.takes: at most one isStarred=true
 * - Scene: unique Shot ids, prevShotRef points to an earlier Shot in same Scene
 * - BodyProfile: exactly 3 images
 * - FaceProfile: exactly 5 images
 * - Character: at least one Look, unique Look names
 */

export class DomainInvariantError extends Error {
  public override readonly name = "DomainInvariantError";
}

// ---------------------------------------------------------------------------
// Refs (from Shot to Character/Location/Prop)
// ---------------------------------------------------------------------------

export interface CharacterRef {
  readonly character: string; // Character.name
  readonly look: string; // Look.name within that Character
}

export interface LocationRef {
  readonly location: string; // Location.name
  readonly reference?: string | undefined; // optional specific angle
}

export interface PropRef {
  readonly prop: string; // Prop.name
  readonly reference?: string | undefined;
}

// ---------------------------------------------------------------------------
// Take
// ---------------------------------------------------------------------------

export interface Take {
  readonly id: string;
  readonly videoPath: string;
  readonly screenplayHash: string;
  /**
   * ISO 8601 timestamp when this Take was first uploaded. Immutable per
   * CONTEXT.md ("Take is immutable") — once written, the tool never rewrites
   * it. Required so the on-disk provenance is never silently invented.
   */
  readonly createdAt: string;
  readonly isStarred: boolean;
}

export interface CreateTakeInput {
  id: string;
  videoPath: string;
  screenplayHash: string;
  createdAt: string;
  isStarred?: boolean;
}

export function createTake(input: CreateTakeInput): Take {
  if (!input.id) throw new DomainInvariantError("Take.id is required");
  if (!input.videoPath)
    throw new DomainInvariantError("Take.videoPath is required");
  if (!input.screenplayHash)
    throw new DomainInvariantError("Take.screenplayHash is required");
  if (!input.createdAt)
    throw new DomainInvariantError("Take.createdAt is required");
  return {
    id: input.id,
    videoPath: input.videoPath,
    screenplayHash: input.screenplayHash,
    createdAt: input.createdAt,
    isStarred: input.isStarred ?? false,
  };
}

// ---------------------------------------------------------------------------
// Shot
// ---------------------------------------------------------------------------

export interface Shot {
  readonly id: string;
  readonly prompt: string;
  readonly duration: number;
  readonly screenplayHash: string;
  readonly prevShotRef?: string | undefined;
  readonly characterRefs: readonly CharacterRef[];
  readonly locationRefs: readonly LocationRef[];
  readonly propRefs: readonly PropRef[];
  readonly takes: readonly Take[];
}

export interface CreateShotInput {
  id: string;
  prompt: string;
  duration: number;
  screenplayHash: string;
  prevShotRef?: string | undefined;
  characterRefs?: readonly CharacterRef[];
  locationRefs?: readonly LocationRef[];
  propRefs?: readonly PropRef[];
  takes?: readonly Take[];
}

const SHOT_DURATION_MIN = 4;
const SHOT_DURATION_MAX = 15;

export function createShot(input: CreateShotInput): Shot {
  if (!input.id) throw new DomainInvariantError("Shot.id is required");
  if (!input.prompt)
    throw new DomainInvariantError(`Shot[${input.id}].prompt is required`);

  if (!Number.isInteger(input.duration)) {
    throw new DomainInvariantError(
      `Shot[${input.id}].duration must be an integer (got ${input.duration})`,
    );
  }
  if (
    input.duration < SHOT_DURATION_MIN ||
    input.duration > SHOT_DURATION_MAX
  ) {
    throw new DomainInvariantError(
      `Shot[${input.id}].duration must be within [${SHOT_DURATION_MIN}, ${SHOT_DURATION_MAX}] seconds (got ${input.duration})`,
    );
  }

  const takes = input.takes ?? [];
  const starred = takes.filter((t) => t.isStarred);
  if (starred.length > 1) {
    throw new DomainInvariantError(
      `Shot[${input.id}] has ${starred.length} starred Takes (max 1)`,
    );
  }

  return {
    id: input.id,
    prompt: input.prompt,
    duration: input.duration,
    screenplayHash: input.screenplayHash,
    prevShotRef: input.prevShotRef,
    characterRefs: input.characterRefs ?? [],
    locationRefs: input.locationRefs ?? [],
    propRefs: input.propRefs ?? [],
    takes,
  };
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

export interface Scene {
  readonly slug: string;
  readonly slugline: string;
  readonly screenplay: string;
  readonly isStarred: boolean;
  readonly shots: readonly Shot[];
}

export interface CreateSceneInput {
  slug: string;
  slugline: string;
  screenplay: string;
  isStarred: boolean;
  shots: readonly Shot[];
}

export function createScene(input: CreateSceneInput): Scene {
  if (!input.slug)
    throw new DomainInvariantError("Scene.slug is required");
  if (!input.slugline)
    throw new DomainInvariantError(
      `Scene[${input.slug}].slugline is required`,
    );

  // Unique shot ids
  const seen = new Set<string>();
  for (const shot of input.shots) {
    if (seen.has(shot.id)) {
      throw new DomainInvariantError(
        `Scene[${input.slug}] has duplicate Shot id "${shot.id}"`,
      );
    }
    seen.add(shot.id);
  }

  // prevShotRef must point to an earlier shot in this same scene
  const seenSoFar = new Set<string>();
  for (const shot of input.shots) {
    if (shot.prevShotRef !== undefined) {
      if (!seenSoFar.has(shot.prevShotRef)) {
        throw new DomainInvariantError(
          `Scene[${input.slug}] Shot[${shot.id}].prevShotRef "${shot.prevShotRef}" must refer to an earlier Shot in the same Scene`,
        );
      }
    }
    seenSoFar.add(shot.id);
  }

  return {
    slug: input.slug,
    slugline: input.slugline,
    screenplay: input.screenplay,
    isStarred: input.isStarred,
    shots: input.shots,
  };
}

// ---------------------------------------------------------------------------
// BodyProfile / FaceProfile / Look / Character
// ---------------------------------------------------------------------------

const BODY_PROFILE_COUNT = 3;
const FACE_PROFILE_COUNT = 5;

export interface BodyProfile {
  readonly images: readonly string[];
}

export function createBodyProfile(images: readonly string[]): BodyProfile {
  if (images.length !== BODY_PROFILE_COUNT) {
    throw new DomainInvariantError(
      `BodyProfile requires exactly ${BODY_PROFILE_COUNT} images (got ${images.length})`,
    );
  }
  return { images };
}

export interface FaceProfile {
  readonly images: readonly string[];
}

export function createFaceProfile(images: readonly string[]): FaceProfile {
  if (images.length !== FACE_PROFILE_COUNT) {
    throw new DomainInvariantError(
      `FaceProfile requires exactly ${FACE_PROFILE_COUNT} images (got ${images.length})`,
    );
  }
  return { images };
}

export interface Look {
  readonly name: string;
  readonly bodyProfile: BodyProfile;
  readonly faceProfile: FaceProfile;
}

export interface CreateLookInput {
  name: string;
  bodyProfile: BodyProfile;
  faceProfile: FaceProfile;
}

export function createLook(input: CreateLookInput): Look {
  if (!input.name) throw new DomainInvariantError("Look.name is required");
  return {
    name: input.name,
    bodyProfile: input.bodyProfile,
    faceProfile: input.faceProfile,
  };
}

export interface Character {
  readonly name: string;
  readonly headshot: string;
  readonly looks: readonly Look[];
}

export interface CreateCharacterInput {
  name: string;
  headshot: string;
  looks: readonly Look[];
}

export function createCharacter(input: CreateCharacterInput): Character {
  if (!input.name)
    throw new DomainInvariantError("Character.name is required");
  if (!input.headshot)
    throw new DomainInvariantError(
      `Character[${input.name}].headshot is required`,
    );
  if (input.looks.length === 0) {
    throw new DomainInvariantError(
      `Character[${input.name}] requires at least one Look`,
    );
  }
  const seen = new Set<string>();
  for (const look of input.looks) {
    if (seen.has(look.name)) {
      throw new DomainInvariantError(
        `Character[${input.name}] has duplicate Look name "${look.name}"`,
      );
    }
    seen.add(look.name);
  }
  return {
    name: input.name,
    headshot: input.headshot,
    looks: input.looks,
  };
}

// ---------------------------------------------------------------------------
// Location / Prop / Reference
// ---------------------------------------------------------------------------

export interface ImageReference {
  readonly name: string;
  readonly prompt: string;
  readonly image: string;
}

export interface Location {
  readonly name: string;
  readonly references: readonly ImageReference[];
}

export function createLocation(input: {
  name: string;
  references: readonly ImageReference[];
}): Location {
  if (!input.name) throw new DomainInvariantError("Location.name is required");
  return { name: input.name, references: input.references };
}

export interface Prop {
  readonly name: string;
  readonly references: readonly ImageReference[];
}

export function createProp(input: {
  name: string;
  references: readonly ImageReference[];
}): Prop {
  if (!input.name) throw new DomainInvariantError("Prop.name is required");
  return { name: input.name, references: input.references };
}

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export interface Project {
  readonly scenes: readonly Scene[];
  readonly characters: readonly Character[];
  readonly locations: readonly Location[];
  readonly props: readonly Prop[];
}

export function createProject(input: {
  scenes: readonly Scene[];
  characters: readonly Character[];
  locations: readonly Location[];
  props: readonly Prop[];
}): Project {
  // Reference integrity: every Shot's character/location/prop ref must exist.
  const characterByName = new Map(input.characters.map((c) => [c.name, c]));
  const locationNames = new Set(input.locations.map((l) => l.name));
  const propNames = new Set(input.props.map((p) => p.name));

  for (const scene of input.scenes) {
    for (const shot of scene.shots) {
      for (const ref of shot.characterRefs) {
        const char = characterByName.get(ref.character);
        if (!char) {
          throw new DomainInvariantError(
            `Scene[${scene.slug}] Shot[${shot.id}] references unknown Character "${ref.character}"`,
          );
        }
        if (!char.looks.some((l) => l.name === ref.look)) {
          throw new DomainInvariantError(
            `Scene[${scene.slug}] Shot[${shot.id}] references unknown Look "${ref.look}" on Character "${ref.character}"`,
          );
        }
      }
      for (const ref of shot.locationRefs) {
        if (!locationNames.has(ref.location)) {
          throw new DomainInvariantError(
            `Scene[${scene.slug}] Shot[${shot.id}] references unknown Location "${ref.location}"`,
          );
        }
      }
      for (const ref of shot.propRefs) {
        if (!propNames.has(ref.prop)) {
          throw new DomainInvariantError(
            `Scene[${scene.slug}] Shot[${shot.id}] references unknown Prop "${ref.prop}"`,
          );
        }
      }
    }
  }

  return {
    scenes: input.scenes,
    characters: input.characters,
    locations: input.locations,
    props: input.props,
  };
}

/**
 * Movie sequence = isStarred scenes sorted by folder-slug prefix.
 * Per CONTEXT.md: "영화 시퀀스 = `isStarred=true`인 Scene들의 폴더명 prefix 정렬."
 */
export function movieSequence(project: Project): readonly Scene[] {
  return [...project.scenes]
    .filter((s) => s.isStarred)
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

// ---------------------------------------------------------------------------
// Starred toggles — pure immutable updates that re-validate the Project.
// ---------------------------------------------------------------------------

/**
 * Toggle a Scene's `isStarred` flag, returning a new Project. The flag drives
 * movie-sequence membership per CONTEXT.md ("영화 시퀀스 = `isStarred=true`인
 * Scene들의 폴더명 prefix 정렬"). All other Scene fields (slug, slugline,
 * screenplay, shots) are preserved untouched.
 *
 * Rebuilds the Project via `createProject` so reference integrity is re-checked
 * — toggling cannot accidentally introduce an invariant violation, but the
 * defensive re-validation guards against future mutations slipping through
 * this helper.
 */
export function setSceneStarred(
  project: Project,
  sceneSlug: string,
  value: boolean,
): Project {
  const scene = project.scenes.find((s) => s.slug === sceneSlug);
  if (!scene) {
    throw new DomainInvariantError(
      `setSceneStarred: unknown Scene "${sceneSlug}"`,
    );
  }
  const nextScenes = project.scenes.map((s) =>
    s.slug === sceneSlug
      ? createScene({
          slug: s.slug,
          slugline: s.slugline,
          screenplay: s.screenplay,
          isStarred: value,
          shots: s.shots,
        })
      : s,
  );
  return createProject({
    scenes: nextScenes,
    characters: project.characters,
    locations: project.locations,
    props: project.props,
  });
}

/**
 * Replace a Scene's `slugline` text, returning a new Project. Used by the
 * Light edit (Slice 5) slugline editor. The screenplay, shots, and isStarred
 * are preserved untouched. createScene re-validates the invariant
 * "slugline required" so an empty value rejects.
 */
export function setSceneSlugline(
  project: Project,
  sceneSlug: string,
  slugline: string,
): Project {
  const scene = project.scenes.find((s) => s.slug === sceneSlug);
  if (!scene) {
    throw new DomainInvariantError(
      `setSceneSlugline: unknown Scene "${sceneSlug}"`,
    );
  }
  const nextScenes = project.scenes.map((s) =>
    s.slug === sceneSlug
      ? createScene({
          slug: s.slug,
          slugline,
          screenplay: s.screenplay,
          isStarred: s.isStarred,
          shots: s.shots,
        })
      : s,
  );
  return createProject({
    scenes: nextScenes,
    characters: project.characters,
    locations: project.locations,
    props: project.props,
  });
}

/**
 * Replace a Scene's `screenplay` (Markdown body), returning a new Project.
 * Used by the Light edit (Slice 5) screenplay editor — the caller is
 * responsible for validating that the new text preserves the Shot markers
 * (`validateMarkerConsistency` in `marker-parser.ts`). All other Scene
 * fields are preserved untouched.
 */
export function setSceneScreenplay(
  project: Project,
  sceneSlug: string,
  screenplay: string,
): Project {
  const scene = project.scenes.find((s) => s.slug === sceneSlug);
  if (!scene) {
    throw new DomainInvariantError(
      `setSceneScreenplay: unknown Scene "${sceneSlug}"`,
    );
  }
  const nextScenes = project.scenes.map((s) =>
    s.slug === sceneSlug
      ? createScene({
          slug: s.slug,
          slugline: s.slugline,
          screenplay,
          isStarred: s.isStarred,
          shots: s.shots,
        })
      : s,
  );
  return createProject({
    scenes: nextScenes,
    characters: project.characters,
    locations: project.locations,
    props: project.props,
  });
}

/**
 * Toggle a Take's `isStarred` flag, returning a new Project. Enforces the
 * Shot-level invariant (at most 1 starred Take per Shot) by automatically
 * turning OFF any other starred Take in the same Shot when `value=true`.
 *
 * Per CONTEXT.md: "isStarred (on Take): 해당 Shot의 채택된 Take. Shot당 최대 1개."
 *
 * The Take's other fields (videoPath, screenplayHash, createdAt — immutable
 * provenance) are preserved. Other Shots in the Scene and other Scenes are
 * untouched.
 */
export function setTakeStarred(
  project: Project,
  sceneSlug: string,
  shotId: string,
  takeId: string,
  value: boolean,
): Project {
  const scene = project.scenes.find((s) => s.slug === sceneSlug);
  if (!scene) {
    throw new DomainInvariantError(
      `setTakeStarred: unknown Scene "${sceneSlug}"`,
    );
  }
  const shot = scene.shots.find((s) => s.id === shotId);
  if (!shot) {
    throw new DomainInvariantError(
      `setTakeStarred: unknown Shot "${shotId}" in Scene "${sceneSlug}"`,
    );
  }
  if (!shot.takes.some((t) => t.id === takeId)) {
    throw new DomainInvariantError(
      `setTakeStarred: unknown Take "${takeId}" in Shot "${shotId}" (Scene "${sceneSlug}")`,
    );
  }

  // When setting a Take to starred=true, force all sibling Takes to false to
  // honor the Shot-level invariant. When setting to false, only flip the
  // target.
  const nextTakes = shot.takes.map((t) => {
    if (t.id === takeId) {
      return createTake({
        id: t.id,
        videoPath: t.videoPath,
        screenplayHash: t.screenplayHash,
        createdAt: t.createdAt,
        isStarred: value,
      });
    }
    if (value && t.isStarred) {
      return createTake({
        id: t.id,
        videoPath: t.videoPath,
        screenplayHash: t.screenplayHash,
        createdAt: t.createdAt,
        isStarred: false,
      });
    }
    return t;
  });

  const nextShot = createShot({
    id: shot.id,
    prompt: shot.prompt,
    duration: shot.duration,
    screenplayHash: shot.screenplayHash,
    prevShotRef: shot.prevShotRef,
    characterRefs: shot.characterRefs,
    locationRefs: shot.locationRefs,
    propRefs: shot.propRefs,
    takes: nextTakes,
  });

  const nextShots = scene.shots.map((s) => (s.id === shotId ? nextShot : s));
  const nextScene = createScene({
    slug: scene.slug,
    slugline: scene.slugline,
    screenplay: scene.screenplay,
    isStarred: scene.isStarred,
    shots: nextShots,
  });
  const nextScenes = project.scenes.map((s) =>
    s.slug === sceneSlug ? nextScene : s,
  );
  return createProject({
    scenes: nextScenes,
    characters: project.characters,
    locations: project.locations,
    props: project.props,
  });
}
