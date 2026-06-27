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
 * - Look: face + body ImageRefs required (each a single pre-split sheet image)
 * - Character: at least one Look, unique Look names
 * - ImageRef.refName (engine @이름): charset [a-z0-9_]+ + project-wide unique
 */

import { computeScreenplayHash } from "./hash-calculator.js";
import { parseShotMarkers } from "./marker-parser.js";

export class DomainInvariantError extends Error {
  public override readonly name = "DomainInvariantError";
}

/**
 * Compute the canonical "current" hash for a given Shot id in a Scene by
 * concatenating the normalized text of all marker blocks that match the
 * Shot id (joined by a blank line) and hashing. Mirrors `evaluateSceneSync`
 * so acknowledge → sync status remain consistent.
 *
 * Returns `undefined` if the screenplay has no matching marker block (orphan
 * Shot). Callers decide whether that is an error (acknowledge) or just a
 * status signal (evaluate).
 */
function currentShotMarkerHash(
  scene: Scene,
  shotId: string,
): string | undefined {
  const blocks = parseShotMarkers(scene.screenplay).filter(
    (b) => b.shotId === shotId,
  );
  if (blocks.length === 0) return undefined;
  return computeScreenplayHash(blocks.map((b) => b.text).join("\n\n"));
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
  /**
   * Optional camera/film/grade look key — overrides the Scene's `look` for this
   * Shot. Resolves against the preset's `looks` map (see prompt-preset.ts).
   * `undefined` ⇒ inherit the Scene's look (or the reserved `default` look).
   * NOTE: distinct from `characterRefs[].look` (a character's wardrobe).
   */
  readonly look?: string | undefined;
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
  look?: string | undefined;
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
    look: input.look,
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
  /**
   * Optional camera/film/grade look key for the whole Scene — resolves against
   * the preset's `looks` map (see prompt-preset.ts). A Shot may override per-shot
   * via `Shot.look`. `undefined` ⇒ the reserved `default` look applies.
   */
  readonly look?: string | undefined;
  readonly shots: readonly Shot[];
}

export interface CreateSceneInput {
  slug: string;
  slugline: string;
  screenplay: string;
  isStarred: boolean;
  look?: string | undefined;
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
    look: input.look,
    shots: input.shots,
  };
}

// ---------------------------------------------------------------------------
// Look / Character
// ---------------------------------------------------------------------------

/**
 * FaceProfile / BodyProfile (per CONTEXT.md ubiquitous language) are each a
 * SINGLE reference image already divided into panels — face = 5-panel split
 * sheet, body = 3-panel split sheet. They live on the Look as `face` / `body`
 * ImageReferences (relative asset path + optional engine `@refName`). The panel
 * split is baked into the image, so there is no per-panel count to enforce here.
 */
export interface Look {
  readonly name: string;
  /** Face reference — single 5-panel split sheet, with optional engine @refName. */
  readonly face: ImageReference;
  /** Body reference — single 3-panel split sheet, with optional engine @refName. */
  readonly body: ImageReference;
  /**
   * Optional outfit source — a single 2-panel sheet (front + back view) of the
   * outfit. The director generates this (default prompt: DEFAULT_UNIFORM_PROMPT)
   * and derives `face`/`body` from it. Carries its own generation `prompt`.
   */
  readonly uniform?: ImageReference;
  /**
   * Optional unified character sheet — a single 3-panel image (left: full body
   * front/back · center: close-up headshot · right: 4 face angles). Generated
   * FROM the Character headshot + this Look's uniform (default prompt:
   * DEFAULT_SHEET_PROMPT). Carries its own generation `prompt`. Additive — does
   * not replace `face`/`body`.
   */
  readonly sheet?: ImageReference;
}

export interface CreateLookInput {
  name: string;
  face: ImageReference;
  body: ImageReference;
  uniform?: ImageReference;
  sheet?: ImageReference;
}

export function createLook(input: CreateLookInput): Look {
  if (!input.name) throw new DomainInvariantError("Look.name is required");
  if (!input.face?.image)
    throw new DomainInvariantError(`Look[${input.name}].face.image is required`);
  if (!input.body?.image)
    throw new DomainInvariantError(`Look[${input.name}].body.image is required`);
  if (input.uniform !== undefined && !input.uniform.image)
    throw new DomainInvariantError(
      `Look[${input.name}].uniform.image is required when uniform is set`,
    );
  if (input.sheet !== undefined && !input.sheet.image)
    throw new DomainInvariantError(
      `Look[${input.name}].sheet.image is required when sheet is set`,
    );
  return {
    name: input.name,
    face: input.face,
    body: input.body,
    ...(input.uniform !== undefined ? { uniform: input.uniform } : {}),
    ...(input.sheet !== undefined ? { sheet: input.sheet } : {}),
  };
}

/**
 * Default generation prompt for a Character headshot (face ID). The director/LLM
 * starts from this when creating the headshot reference image.
 */
export const DEFAULT_HEADSHOT_PROMPT =
  "캐릭터 얼굴 ID 헤드샷, 정면 클로즈업, 중립 표정, 어깨선까지, 단색 배경, 균일한 부드러운 조명, 또렷한 이목구비, 의상·헤어 변화와 무관한 얼굴 식별용, 글씨·워터마크 없음.";

/**
 * Default generation prompt for a Look uniform — a single 2-panel sheet showing
 * the outfit front and back, from which face/body refs are derived.
 */
export const DEFAULT_UNIFORM_PROMPT =
  "한 의상의 2분할 레퍼런스 시트 한 장 — 왼쪽 패널=정면 전신, 오른쪽 패널=후면 전신. 동일 인물·동일 의상, 전신 안 잘리게, 중립 A-포즈, 정면 카메라, 단색 밝은 회색 배경, 균일한 스튜디오 조명, 소품·글씨·워터마크 없음.";

/**
 * Default generation prompt for the unified character sheet — generated from the
 * Character headshot + this Look's uniform. A single 3-panel image: full body
 * front/back (left) · close-up headshot (center) · 4 face angles (right).
 */
export const DEFAULT_SHEET_PROMPT =
  "첨부한 헤드샷(얼굴 ID)과 uniform(의상 앞/뒤)을 바탕으로 만든 통합 캐릭터 레퍼런스 시트 한 장, 가로 3분할. 중앙: 얼굴 클로즈업(정면, 중립 표정, 얼굴 ID). 왼쪽: 전신 — 위 정면 / 아래 후면(uniform 의상 유지, A-포즈). 오른쪽: 얼굴 각도 4분할 — 3/4 좌, 3/4 우, 정측면, 로우앵글(아래에서). 동일 인물·동일 의상·일관된 조명, 단색 밝은 회색 배경, 전신 안 잘리게, 소품·글씨·워터마크 없음.";

/**
 * Default generation prompt for a Look face sheet (FaceProfile) — left: front
 * close-up headshot · right: 4 face angles (3/4 L, 3/4 R, side, from below).
 * Generated from the Character headshot + this Look's outfit.
 */
export const DEFAULT_FACE_PROMPT =
  "첨부한 헤드샷(얼굴 ID)과 uniform(의상)을 바탕으로 만든 얼굴 레퍼런스 시트 한 장. 왼쪽: 정면 클로즈업 헤드샷. 오른쪽: 얼굴 각도 4분할 — 3/4 좌, 3/4 우, 측면, 아래에서 본 모습(로우앵글). 동일 인물·동일 얼굴, 해당 의상의 헤어·넥라인 반영, 중립 표정, 단색 배경, 균일한 조명, 글씨·워터마크 없음.";

/**
 * Default generation prompt for a Look body sheet (BodyProfile) — 3 panels:
 * left headshot · center full-body front · right full-body back. Generated from
 * the Character headshot + this Look's outfit.
 */
export const DEFAULT_BODY_PROMPT =
  "첨부한 헤드샷(얼굴 ID)과 uniform(의상)을 바탕으로 만든 전신 레퍼런스 시트 한 장, 가로 3분할 — 왼쪽: 헤드샷(정면 클로즈업), 가운데: 전신 앞면, 오른쪽: 전신 뒷면. 동일 인물·동일 의상, 중립 A-포즈, 전신 안 잘리게, 단색 밝은 회색 배경, 균일한 스튜디오 조명, 소품·글씨·워터마크 없음.";

export interface Character {
  readonly name: string;
  /** Face ID — single image (character-level), with optional generation prompt. */
  readonly headshot: ImageReference;
  readonly looks: readonly Look[];
}

export interface CreateCharacterInput {
  name: string;
  headshot: ImageReference;
  looks: readonly Look[];
}

export function createCharacter(input: CreateCharacterInput): Character {
  if (!input.name)
    throw new DomainInvariantError("Character.name is required");
  if (!input.headshot?.image)
    throw new DomainInvariantError(
      `Character[${input.name}].headshot.image is required`,
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
  /** Relative asset path of the reference image. */
  readonly image: string;
  /** Human label (e.g. Location/Prop angle name). Optional — Look face/body omit it. */
  readonly name?: string;
  /** How this reference image was generated (Location/Prop). Optional. */
  readonly prompt?: string;
  /**
   * Engine `@이름` — the inline @mention handle (e.g. `p1_c_suah_face`) the
   * director writes in Shot prompts. LLM-authored per the `shot-prompt-authoring`
   * convention; validated for charset + project-uniqueness in `createProject`.
   * Optional: refs without it are simply absent from the @mention registry.
   */
  readonly refName?: string;
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

  // Engine @refName integrity: charset ([a-z0-9_]+ — the @mention charset, no
  // hyphens/uppercase) and project-wide uniqueness across every ImageReference
  // (headshot + Look face/body/uniform + Location/Prop refs). refName is optional, so refs
  // without it are skipped.
  const seenRefName = new Map<string, string>();
  for (const { ref, where } of gatherImageRefs(input)) {
    const rn = ref.refName;
    if (rn === undefined) continue;
    if (!REFNAME_RE.test(rn)) {
      throw new DomainInvariantError(
        `${where} refName "${rn}" must match [a-z0-9_]+ (lowercase letters, digits, underscore only)`,
      );
    }
    const prev = seenRefName.get(rn);
    if (prev) {
      throw new DomainInvariantError(
        `Duplicate refName "${rn}" (${where} and ${prev})`,
      );
    }
    seenRefName.set(rn, where);
  }

  return {
    scenes: input.scenes,
    characters: input.characters,
    locations: input.locations,
    props: input.props,
  };
}

const REFNAME_RE = /^[a-z0-9_]+$/;

interface ProjectImageParts {
  readonly characters: readonly Character[];
  readonly locations: readonly Location[];
  readonly props: readonly Prop[];
}

/** Every ImageReference in the project, tagged with a human-readable location. */
function gatherImageRefs(
  p: ProjectImageParts,
): { ref: ImageReference; where: string }[] {
  const out: { ref: ImageReference; where: string }[] = [];
  for (const c of p.characters) {
    out.push({ ref: c.headshot, where: `Character[${c.name}].headshot` });
    for (const l of c.looks) {
      out.push({ ref: l.face, where: `Character[${c.name}] Look[${l.name}].face` });
      out.push({ ref: l.body, where: `Character[${c.name}] Look[${l.name}].body` });
      if (l.uniform) {
        out.push({
          ref: l.uniform,
          where: `Character[${c.name}] Look[${l.name}].uniform`,
        });
      }
      if (l.sheet) {
        out.push({
          ref: l.sheet,
          where: `Character[${c.name}] Look[${l.name}].sheet`,
        });
      }
    }
  }
  for (const loc of p.locations) {
    for (const r of loc.references) {
      out.push({ ref: r, where: `Location[${loc.name}] ref[${r.name ?? "?"}]` });
    }
  }
  for (const prop of p.props) {
    for (const r of prop.references) {
      out.push({ ref: r, where: `Prop[${prop.name}] ref[${r.name ?? "?"}]` });
    }
  }
  return out;
}

/**
 * The movie's engine @mention registry: every `refName` present across the
 * project's ImageReferences (Character headshot + Look face/body/uniform +
 * Location/Prop references). Used to validate that inline `@names` in Shot
 * prompts point at a real registered ref.
 */
export function collectRefNames(project: Project): string[] {
  return gatherImageRefs(project)
    .map((x) => x.ref.refName)
    .filter((n): n is string => n !== undefined);
}

/**
 * Movie sequence = the starred Scenes, in order.
 *
 * Per ADR 0002 the ORDER is owned by the `data/movie.yaml` manifest, not the
 * folder-name prefix. When an `arrangement` is supplied the linear order is
 * `arrangement.linearSequence()` (act1 ++ act2 ++ act3 flatten) filtered to
 * the starred Scenes. Scenes that are in the project but absent from the
 * arrangement are dropped (the adapter reconciles so this should not normally
 * happen); scenes in the arrangement but absent from the project are skipped.
 *
 * When NO arrangement is supplied (legacy callers / unit fixtures) it falls
 * back to the previous behavior — slug-prefix sort — so existing tests and any
 * caller that has not yet adopted the manifest keep a stable, deterministic
 * order. The production path (dto-mapper) always threads the arrangement.
 */
export function movieSequence(
  project: Project,
  arrangement?: { linearSequence(): readonly string[] },
): readonly Scene[] {
  const starred = project.scenes.filter((s) => s.isStarred);
  if (!arrangement) {
    return starred.sort((a, b) => a.slug.localeCompare(b.slug));
  }
  const bySlug = new Map(starred.map((s) => [s.slug, s]));
  const out: Scene[] = [];
  for (const slug of arrangement.linearSequence()) {
    const scene = bySlug.get(slug);
    if (scene) out.push(scene);
  }
  return out;
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

// ---------------------------------------------------------------------------
// Shot meta mutators — Slice 7 (Shot edit)
//
// All five share the same shape:
//   1. find target Scene/Shot (throw on miss)
//   2. rebuild the Shot via createShot — re-validates duration & invariants
//   3. rebuild the Scene + Project via createScene/createProject — re-validates
//      ref integrity (unknown character/look/location/prop reject)
//
// Returns a new Project; input is untouched. Other Shot fields are preserved
// (screenplayHash, takes, prevShotRef, refs that are not the target field).
// ---------------------------------------------------------------------------

function rebuildShotIn(
  project: Project,
  sceneSlug: string,
  shotId: string,
  patch: (shot: Shot) => Shot,
  caller: string,
): Project {
  const scene = project.scenes.find((s) => s.slug === sceneSlug);
  if (!scene) {
    throw new DomainInvariantError(`${caller}: unknown Scene "${sceneSlug}"`);
  }
  const shot = scene.shots.find((s) => s.id === shotId);
  if (!shot) {
    throw new DomainInvariantError(
      `${caller}: unknown Shot "${shotId}" in Scene "${sceneSlug}"`,
    );
  }
  const nextShot = patch(shot);
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

/**
 * Replace `Shot.prompt` (free-text). `createShot` re-validates the invariant
 * "prompt is required" so empty value rejects. Other fields untouched.
 */
export function setShotPrompt(
  project: Project,
  sceneSlug: string,
  shotId: string,
  prompt: string,
): Project {
  return rebuildShotIn(
    project,
    sceneSlug,
    shotId,
    (shot) =>
      createShot({
        id: shot.id,
        prompt,
        duration: shot.duration,
        screenplayHash: shot.screenplayHash,
        prevShotRef: shot.prevShotRef,
        characterRefs: shot.characterRefs,
        locationRefs: shot.locationRefs,
        propRefs: shot.propRefs,
        takes: shot.takes,
      }),
    "setShotPrompt",
  );
}

/**
 * Replace `Shot.duration` (seconds). `createShot` re-validates the
 * "[4, 15] integer seconds" invariant (씨댄스 2.0 engine limit per CONTEXT.md).
 */
export function setShotDuration(
  project: Project,
  sceneSlug: string,
  shotId: string,
  duration: number,
): Project {
  return rebuildShotIn(
    project,
    sceneSlug,
    shotId,
    (shot) =>
      createShot({
        id: shot.id,
        prompt: shot.prompt,
        duration,
        screenplayHash: shot.screenplayHash,
        prevShotRef: shot.prevShotRef,
        characterRefs: shot.characterRefs,
        locationRefs: shot.locationRefs,
        propRefs: shot.propRefs,
        takes: shot.takes,
      }),
    "setShotDuration",
  );
}

/**
 * Replace `Shot.characterRefs`. `createProject` re-validates reference
 * integrity — refs to unknown Character or unknown Look reject.
 */
export function setShotCharacterRefs(
  project: Project,
  sceneSlug: string,
  shotId: string,
  refs: readonly CharacterRef[],
): Project {
  return rebuildShotIn(
    project,
    sceneSlug,
    shotId,
    (shot) =>
      createShot({
        id: shot.id,
        prompt: shot.prompt,
        duration: shot.duration,
        screenplayHash: shot.screenplayHash,
        prevShotRef: shot.prevShotRef,
        characterRefs: refs,
        locationRefs: shot.locationRefs,
        propRefs: shot.propRefs,
        takes: shot.takes,
      }),
    "setShotCharacterRefs",
  );
}

/**
 * Replace `Shot.locationRefs`. `createProject` re-validates — refs to unknown
 * Location reject. The optional `reference` field (specific angle) is allowed
 * to be any string; we don't validate it against `Location.references` (the
 * domain model treats it as a freeform hint).
 */
export function setShotLocationRefs(
  project: Project,
  sceneSlug: string,
  shotId: string,
  refs: readonly LocationRef[],
): Project {
  return rebuildShotIn(
    project,
    sceneSlug,
    shotId,
    (shot) =>
      createShot({
        id: shot.id,
        prompt: shot.prompt,
        duration: shot.duration,
        screenplayHash: shot.screenplayHash,
        prevShotRef: shot.prevShotRef,
        characterRefs: shot.characterRefs,
        locationRefs: refs,
        propRefs: shot.propRefs,
        takes: shot.takes,
      }),
    "setShotLocationRefs",
  );
}

/**
 * Replace `Shot.prevShotRef` — Slice 8 (Chaining). The argument is `null` to
 * clear the chain or the id of an earlier Shot in the **same Scene**. The
 * "same Scene + earlier" invariant is enforced by `createScene` (which runs
 * inside `rebuildShotIn`) — no extra validation here. Other Shot fields are
 * preserved untouched (prompt, duration, refs, takes, screenplayHash).
 *
 * Per CONTEXT.md: "prevShotRef는 '직전 Shot의 id'만 저장 — 어느 Take를 가리킬지는
 * 도메인 로직이 항상 starred Take로 resolve" (see `resolveChainingTake`).
 *
 * Notes:
 *  - Pointing at the Shot itself is rejected by the createScene invariant
 *    (a Shot can't be earlier than itself).
 *  - Pointing across Scenes is also rejected (the lookup is scoped to the
 *    Scene's `shots` array).
 *  - Pointing forward (a later Shot in the same Scene) is rejected for the
 *    same reason.
 */
export function setShotPrevShotRef(
  project: Project,
  sceneSlug: string,
  shotId: string,
  prevShotRef: string | null,
): Project {
  return rebuildShotIn(
    project,
    sceneSlug,
    shotId,
    (shot) =>
      createShot({
        id: shot.id,
        prompt: shot.prompt,
        duration: shot.duration,
        screenplayHash: shot.screenplayHash,
        prevShotRef: prevShotRef ?? undefined,
        characterRefs: shot.characterRefs,
        locationRefs: shot.locationRefs,
        propRefs: shot.propRefs,
        takes: shot.takes,
      }),
    "setShotPrevShotRef",
  );
}

/**
 * Resolve the chaining target Take for a Shot inside a Scene.
 *
 * Per CONTEXT.md ("Chaining"): when a Shot has `prevShotRef`, the chaining
 * video is **always the previous Shot's starred Take**. The previous Shot's
 * id is the only thing stored on disk — never the Take id — so that toggling
 * which Take is starred automatically follows through to all chained Shots
 * without any explicit propagation.
 *
 * Returns the starred Take, or `null` in these "no chaining target" cases:
 *  - the Shot has no `prevShotRef` (no chain),
 *  - the previous Shot has no starred Take (UI surfaces a warning),
 *  - the Shot id itself is unknown in this Scene (defensive — should not
 *    happen for well-formed DTOs but we don't want to throw on a derive).
 *
 * The Shot.prevShotRef → same-Scene invariant is enforced at construction
 * (`createScene`), so the lookup is always scoped to the input Scene's shots.
 */
export function resolveChainingTake(scene: Scene, shotId: string): Take | null {
  const shot = scene.shots.find((s) => s.id === shotId);
  if (!shot) return null;
  if (shot.prevShotRef === undefined) return null;
  const prev = scene.shots.find((s) => s.id === shot.prevShotRef);
  if (!prev) return null;
  return prev.takes.find((t) => t.isStarred) ?? null;
}

/**
 * Replace `Shot.propRefs`. `createProject` re-validates — refs to unknown
 * Prop reject. The optional `reference` field is freeform (same rationale as
 * `setShotLocationRefs`).
 */
export function setShotPropRefs(
  project: Project,
  sceneSlug: string,
  shotId: string,
  refs: readonly PropRef[],
): Project {
  return rebuildShotIn(
    project,
    sceneSlug,
    shotId,
    (shot) =>
      createShot({
        id: shot.id,
        prompt: shot.prompt,
        duration: shot.duration,
        screenplayHash: shot.screenplayHash,
        prevShotRef: shot.prevShotRef,
        characterRefs: shot.characterRefs,
        locationRefs: shot.locationRefs,
        propRefs: refs,
        takes: shot.takes,
      }),
    "setShotPropRefs",
  );
}

/**
 * Acknowledge a Shot — refresh `Shot.screenplayHash` to the current marker
 * block hash. Per CONTEXT.md ("작은 수정 → hash 갱신 (\"확인됨\" 액션)").
 *
 * Take is immutable and is not touched by this operation — directors who
 * want to mark a Take as still-relevant against the new screenplay must
 * call `acknowledgeTake` separately.
 *
 * Throws DomainInvariantError if:
 *  - Scene slug unknown
 *  - Shot id unknown in that Scene
 *  - The screenplay has no marker block matching this Shot (orphan) — there's
 *    no "current" hash to acknowledge to.
 *
 * The current hash is computed via the same canonical rule used by
 * `SyncEvaluator` (concatenated normalized text of all blocks for the Shot
 * id, joined by `\n\n`) so the acknowledge → status reflects the same model.
 */
export function acknowledgeShot(
  project: Project,
  sceneSlug: string,
  shotId: string,
): Project {
  const scene = project.scenes.find((s) => s.slug === sceneSlug);
  if (!scene) {
    throw new DomainInvariantError(
      `acknowledgeShot: unknown Scene "${sceneSlug}"`,
    );
  }
  const shot = scene.shots.find((s) => s.id === shotId);
  if (!shot) {
    throw new DomainInvariantError(
      `acknowledgeShot: unknown Shot "${shotId}" in Scene "${sceneSlug}"`,
    );
  }

  const currentHash = currentShotMarkerHash(scene, shotId);
  if (currentHash === undefined) {
    throw new DomainInvariantError(
      `acknowledgeShot: Shot "${shotId}" has no matching marker block in screenplay (orphan — nothing to acknowledge)`,
    );
  }

  const nextShot = createShot({
    id: shot.id,
    prompt: shot.prompt,
    duration: shot.duration,
    screenplayHash: currentHash,
    prevShotRef: shot.prevShotRef,
    characterRefs: shot.characterRefs,
    locationRefs: shot.locationRefs,
    propRefs: shot.propRefs,
    takes: shot.takes,
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

/**
 * Acknowledge a Take — refresh `Take.screenplayHash` to the current marker
 * block hash. All other Take fields (videoPath, createdAt, isStarred) are
 * preserved — even though Take provenance is "immutable" in the spec, the
 * hash itself is the one mutable field per CONTEXT.md ("작은 수정 → hash
 * 갱신") because it is metadata about which screenplay revision the video
 * was last reviewed against, not part of the video provenance proper.
 *
 * Throws DomainInvariantError on unknown Scene/Shot/Take or orphan Shot.
 */
export function acknowledgeTake(
  project: Project,
  sceneSlug: string,
  shotId: string,
  takeId: string,
): Project {
  const scene = project.scenes.find((s) => s.slug === sceneSlug);
  if (!scene) {
    throw new DomainInvariantError(
      `acknowledgeTake: unknown Scene "${sceneSlug}"`,
    );
  }
  const shot = scene.shots.find((s) => s.id === shotId);
  if (!shot) {
    throw new DomainInvariantError(
      `acknowledgeTake: unknown Shot "${shotId}" in Scene "${sceneSlug}"`,
    );
  }
  const take = shot.takes.find((t) => t.id === takeId);
  if (!take) {
    throw new DomainInvariantError(
      `acknowledgeTake: unknown Take "${takeId}" in Shot "${shotId}" (Scene "${sceneSlug}")`,
    );
  }

  const currentHash = currentShotMarkerHash(scene, shotId);
  if (currentHash === undefined) {
    throw new DomainInvariantError(
      `acknowledgeTake: Shot "${shotId}" has no matching marker block in screenplay (orphan — nothing to acknowledge)`,
    );
  }

  const nextTakes = shot.takes.map((t) =>
    t.id === takeId
      ? createTake({
          id: t.id,
          videoPath: t.videoPath,
          screenplayHash: currentHash,
          createdAt: t.createdAt,
          isStarred: t.isStarred,
        })
      : t,
  );

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
