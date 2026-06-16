/**
 * Map domain Project to wire DTO consumed by the SPA.
 */

import { actPageRange, beatsForAct, type ActId } from "@domain/beat-sheet.js";
import { parseShotMarkers } from "@domain/marker-parser.js";
import { movieSequence, type Project, type Scene } from "@domain/movie.js";
import {
  assembleFinalPrompt,
  createPromptPreset,
  extractRefMentions,
  type PromptPreset,
} from "@domain/prompt-preset.js";
import { evaluateSceneSync, evaluateTakeSync } from "@domain/sync-evaluator.js";
import type {
  CanvasActDto,
  LibraryCharacterDto,
  LibraryDto,
  LibraryLocationDto,
  LibraryPropDto,
  MovieDto,
  SceneDto,
} from "../shared/dto.js";

/**
 * Minimal structural view of MovieArrangement the mapper needs. Kept narrow
 * (just the readers) so unit fixtures can pass a stub without rehydrating the
 * full aggregate.
 */
interface ArrangementView {
  linearSequence(): readonly string[];
  scenesInAct?(actId: ActId): readonly string[];
}

/**
 * Build the wire DTO. The optional `arrangement` is the Scene-ordering SSOT
 * (`data/movie.yaml`, per ADR 0002): when supplied, `MovieDto.scenes` is the
 * arrangement's linear order (act1 ++ act2 ++ act3 flatten) filtered to the
 * starred Scenes. When omitted (unit fixtures / legacy callers) it falls back
 * to the slug-prefix sort baked into `movieSequence`. The production server
 * always threads the arrangement so the manifest is the single source of
 * truth for order.
 */
export function projectToMovieDto(
  project: Project,
  arrangement?: ArrangementView,
  totalPages = 110,
  preset: PromptPreset = createPromptPreset({}),
): MovieDto {
  const sequenced = movieSequence(project, arrangement);
  return {
    scenes: sequenced.map((s) => sceneToDto(s, preset)),
    allScenes: project.scenes.map((s) => ({
      slug: s.slug,
      slugline: s.slugline,
      isStarred: s.isStarred,
    })),
    ...(arrangement?.scenesInAct
      ? { acts: buildCanvasActs(project, arrangement) }
      : {}),
    totalPages,
    characters: project.characters.map((c) => ({
      name: c.name,
      headshot: c.headshot,
      looks: c.looks.map((l) => ({ name: l.name })),
    })),
    locations: project.locations.map((l) => ({ name: l.name })),
    props: project.props.map((p) => ({ name: p.name })),
  };
}

/**
 * Build the BS2 canvas view (read-only, slice #20): 3 act rows, each with its
 * ordered *starred* Scene slugs and its beat ruler. Act membership + order come
 * from the manifest (`arrangement.scenesInAct`, ADR 0002); non-starred Scenes
 * are filtered out because the canvas shows only the movie sequence (PRD). The
 * beat ruler is the fixed BS2 definition (BeatSheet domain) — a visual guide
 * only, never a Scene assignment.
 */
function buildCanvasActs(
  project: Project,
  arrangement: ArrangementView,
): CanvasActDto[] {
  const starred = new Set(
    project.scenes.filter((s) => s.isStarred).map((s) => s.slug),
  );
  const acts: ActId[] = [1, 2, 3];
  const ranges = new Map(acts.map((id) => [id, actPageRange(id)] as const));
  const totalSpan = acts.reduce((acc, id) => {
    const r = ranges.get(id)!;
    return acc + (r.end - r.start);
  }, 0);
  return acts.map((id) => {
    const r = ranges.get(id)!;
    return {
      id,
      sceneSlugs: (arrangement.scenesInAct!(id) ?? []).filter((slug) =>
        starred.has(slug),
      ),
      beats: beatsForAct(id).map((b) => ({
        number: b.number,
        label: b.label,
        description: b.description,
        startPage: b.startPage,
        endPage: b.endPage,
        kind: b.kind,
        leftPct: b.leftPct,
        widthPct: b.widthPct,
      })),
      pageStart: r.start,
      pageEnd: r.end,
      pagePct: ((r.end - r.start) / totalSpan) * 100,
    };
  });
}

function sceneToDto(scene: Scene, preset: PromptPreset): SceneDto {
  const markers = parseShotMarkers(scene.screenplay);
  const syncByShotId = new Map(
    evaluateSceneSync(scene).map((s) => [s.shotId, s.status]),
  );

  return {
    slug: scene.slug,
    slugline: scene.slugline,
    screenplay: scene.screenplay,
    isStarred: scene.isStarred,
    markers: markers.map((m) => ({
      shotId: m.shotId,
      text: m.text,
      openLine: m.openLine,
      closeLine: m.closeLine,
    })),
    shots: scene.shots.map((shot) => ({
      id: shot.id,
      prompt: shot.prompt,
      finalPrompt: assembleFinalPrompt(shot, preset),
      refMentions: extractRefMentions(shot.prompt),
      duration: shot.duration,
      screenplayHash: shot.screenplayHash,
      ...(shot.prevShotRef !== undefined
        ? { prevShotRef: shot.prevShotRef }
        : {}),
      characterRefs: shot.characterRefs.map((r) => ({
        character: r.character,
        look: r.look,
      })),
      locationRefs: shot.locationRefs.map((r) => ({
        location: r.location,
        ...(r.reference !== undefined ? { reference: r.reference } : {}),
      })),
      propRefs: shot.propRefs.map((r) => ({
        prop: r.prop,
        ...(r.reference !== undefined ? { reference: r.reference } : {}),
      })),
      takes: shot.takes.map((t) => ({
        id: t.id,
        videoPath: t.videoPath,
        screenplayHash: t.screenplayHash,
        createdAt: t.createdAt,
        isStarred: t.isStarred,
        syncStatus: evaluateTakeSync(scene, shot.id, t.id),
      })),
      syncStatus: syncByShotId.get(shot.id) ?? "orphan",
    })),
  };
}

/**
 * Library mapping — richer than MovieDto because the /library page needs the
 * exact image slot layout (face×5, body×3, references[]) so it can render
 * empty slots distinctly.
 */
export function projectToLibraryDto(project: Project): LibraryDto {
  return {
    characters: project.characters.map(characterToLibrary),
    locations: project.locations.map(locationToLibrary),
    props: project.props.map(propToLibrary),
  };
}

function characterToLibrary(c: Project["characters"][number]): LibraryCharacterDto {
  return {
    name: c.name,
    headshot: c.headshot,
    looks: c.looks.map((l) => ({
      name: l.name,
      faceImage: l.faceImage,
      bodyImage: l.bodyImage,
    })),
  };
}

function locationToLibrary(
  l: Project["locations"][number],
): LibraryLocationDto {
  return {
    name: l.name,
    references: l.references.map((r) => ({
      name: r.name,
      prompt: r.prompt,
      image: r.image,
    })),
  };
}

function propToLibrary(p: Project["props"][number]): LibraryPropDto {
  return {
    name: p.name,
    references: p.references.map((r) => ({
      name: r.name,
      prompt: r.prompt,
      image: r.image,
    })),
  };
}
