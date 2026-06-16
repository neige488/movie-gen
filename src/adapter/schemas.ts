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
 * (empty affixes + no registered refs), so an absent or partial file is valid.
 * `refs` lists the engine's registered `@names` for this movie (without the
 * leading `@`); when present, Shot prompts are validated against it. The schema
 * only guards types; an actively malformed file (wrong types) is rejected
 * loudly per the no-silent-fallback rule.
 */
export const promptPresetFileSchema = z.object({
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  refs: z.array(z.string().min(1)).optional(),
});
export type PromptPresetFile = z.infer<typeof promptPresetFileSchema>;

export const lookFileSchema = z.object({
  name: z.string().min(1),
  // Each profile is a single pre-split sheet image (face = 5 panels, body = 3),
  // stored as a relative asset path — same shape as Character.headshot.
  faceImage: z.string().min(1),
  bodyImage: z.string().min(1),
});

export const characterFileSchema = z.object({
  name: z.string().min(1),
  headshot: z.string().min(1),
  looks: z.array(lookFileSchema),
});
export type CharacterFile = z.infer<typeof characterFileSchema>;

export const imageReferenceFileSchema = z.object({
  name: z.string().min(1),
  prompt: z.string().min(1),
  image: z.string().min(1),
});

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
