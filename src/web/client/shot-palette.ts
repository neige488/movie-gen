/**
 * Shot palette — hash a Shot id to a deterministic, distinct color.
 *
 * Both the ShotCard accent bar and the Marker visualization in the
 * ScreenplayEditor consume this so a given Shot wears the same colour on the
 * left (screenplay) and right (cards). Per CONTEXT.md the marker is the
 * primary mental-model anchor — the colour is the visual reinforcement.
 *
 * Implementation: stable string hash → HSL hue rotation. We bias saturation
 * and lightness so the colour reads on both light backgrounds (chip pills,
 * card border) and the screenplay text background (subtle highlight). Pure
 * function — no React, no DOM.
 */

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function hashStr(s: string): number {
  let h = FNV_OFFSET;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME);
  }
  return h >>> 0;
}

export interface ShotPaletteColor {
  /** Strong accent — used on card border, chip border, screenplay underline. */
  accent: string;
  /** Lightly tinted background — used on marker-block highlight. */
  background: string;
  /** Hue degrees [0, 360). Exposed so consumers can derive related shades. */
  hue: number;
}

/**
 * Compute a colour for a Shot id. Deterministic across renders.
 *
 * Hue rotates the full circle; saturation is moderate (60%) and lightness
 * sits above the page background so the highlight reads as a tint, not a
 * block of colour over text.
 */
export function shotPaletteColor(shotId: string): ShotPaletteColor {
  const hue = hashStr(shotId) % 360;
  return {
    accent: `hsl(${hue}, 65%, 45%)`,
    background: `hsl(${hue}, 70%, 92%)`,
    hue,
  };
}
