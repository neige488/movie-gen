/**
 * Map domain Project to wire DTO consumed by the SPA.
 */

import { parseShotMarkers } from "@domain/marker-parser.js";
import { movieSequence, type Project, type Scene } from "@domain/movie.js";
import { evaluateSceneSync, evaluateTakeSync } from "@domain/sync-evaluator.js";
import type {
  LibraryCharacterDto,
  LibraryDto,
  LibraryLocationDto,
  LibraryPropDto,
  MovieDto,
  SceneDto,
} from "../shared/dto.js";

export function projectToMovieDto(project: Project): MovieDto {
  const sequenced = movieSequence(project);
  return {
    scenes: sequenced.map(sceneToDto),
    allScenes: project.scenes.map((s) => ({
      slug: s.slug,
      slugline: s.slugline,
      isStarred: s.isStarred,
    })),
    characters: project.characters.map((c) => ({
      name: c.name,
      headshot: c.headshot,
      looks: c.looks.map((l) => ({ name: l.name })),
    })),
    locations: project.locations.map((l) => ({ name: l.name })),
    props: project.props.map((p) => ({ name: p.name })),
  };
}

function sceneToDto(scene: Scene): SceneDto {
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
      bodyImages: [...l.bodyProfile.images],
      faceImages: [...l.faceProfile.images],
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
