/**
 * Zod schemas for YAML payloads. These describe the on-disk shape — domain
 * factories are responsible for the deeper invariants (duration range, image
 * counts, ref integrity, etc.). Two-tier validation keeps schema errors
 * (structural) and invariant errors (semantic) clearly separated in messages.
 */

import { z } from "zod";

export const sceneFileSchema = z.object({
  slugline: z.string().min(1, "slugline is required"),
  isStarred: z.boolean(),
  // Optional camera/film/grade look key — resolves against the preset's `looks`
  // map (validated at boot by findUnregisteredLooks). Distinct from a
  // character's wardrobe look (characterRefs[].look).
  look: z.string().min(1).optional(),
});
export type SceneFile = z.infer<typeof sceneFileSchema>;

export const characterRefSchema = z.object({
  character: z.string().min(1),
  look: z.string().min(1),
});

export const locationRefSchema = z.object({
  location: z.string().min(1),
  reference: z.string().optional(),
});

export const propRefSchema = z.object({
  prop: z.string().min(1),
  reference: z.string().optional(),
});

export const takeFileSchema = z.object({
  id: z.string().min(1),
  videoPath: z.string().min(1),
  screenplayHash: z.string().min(1),
  createdAt: z.string().min(1),
  isStarred: z.boolean().optional(),
});

export const shotFileSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  duration: z.number(),
  screenplayHash: z.string().min(1),
  prevShotRef: z.string().optional(),
  // Optional per-shot look override — see sceneFileSchema.look.
  look: z.string().min(1).optional(),
  characterRefs: z.array(characterRefSchema).default([]),
  locationRefs: z.array(locationRefSchema).default([]),
  propRefs: z.array(propRefSchema).default([]),
  takes: z.array(takeFileSchema).default([]),
});

export const shotsFileSchema = z.object({
  shots: z.array(shotFileSchema).default([]),
});
export type ShotsFile = z.infer<typeof shotsFileSchema>;

/**
 * Movie-level prompt preset (`data/prompt-preset.yaml`). Every field is
 * optional on disk — the domain factory (`createPromptPreset`) fills the gaps
 * (empty affixes), so an absent or partial file is valid. The `@mention`
 * registry is NOT stored here; it is derived from the library's ImageReference
 * refNames (`collectRefNames`). The schema only guards types; an actively
 * malformed file (wrong types) is rejected loudly per no-silent-fallback.
 */
export const promptPresetFileSchema = z.object({
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  // Named camera/film/grade packages — `look` key -> full prefix text. Generic:
  // the movie defines its own key names (e.g. fantasy/reality). The reserved key
  // `default` applies to Scenes/Shots with no `look`.
  looks: z.record(z.string()).optional(),
});
export type PromptPresetFile = z.infer<typeof promptPresetFileSchema>;

/**
 * Unified reference-image atom. `image` is the only required field. `name`
 * (human/angle label) and `prompt` (generation prompt) are used by Location/Prop
 * references; Look face/body omit them. `refName` is the engine `@이름` (@mention
 * handle, e.g. `p1_c_suah_face`) — optional, validated in the domain.
 */
export const imageReferenceFileSchema = z.object({
  image: z.string().min(1),
  name: z.string().min(1).optional(),
  prompt: z.string().min(1).optional(),
  refName: z.string().min(1).optional(),
});

export const lookFileSchema = z.object({
  name: z.string().min(1),
  // Each profile is a single pre-split sheet image (face = 5 panels, body = 3)
  // as an ImageReference (relative asset path + optional engine @refName).
  face: imageReferenceFileSchema,
  body: imageReferenceFileSchema,
  // Optional outfit source — a single 2-panel (front + back) sheet the director
  // derives face/body from. Carries its own generation prompt.
  uniform: imageReferenceFileSchema.optional(),
});

export const characterFileSchema = z.object({
  name: z.string().min(1),
  // Face ID — an ImageReference (image + optional generation prompt / @refName).
  headshot: imageReferenceFileSchema,
  looks: z.array(lookFileSchema),
});
export type CharacterFile = z.infer<typeof characterFileSchema>;

export const locationFileSchema = z.object({
  name: z.string().min(1),
  references: z.array(imageReferenceFileSchema).default([]),
});
export type LocationFile = z.infer<typeof locationFileSchema>;

export const propFileSchema = z.object({
  name: z.string().min(1),
  references: z.array(imageReferenceFileSchema).default([]),
});
export type PropFile = z.infer<typeof propFileSchema>;
