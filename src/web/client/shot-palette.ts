/**
 * Shot palette — hash a Shot id to a deterministic, distinct color.
 *
 * Both the ShotCard accent bar and the Marker visualization in the
 * ScreenplayEditor consume this so a given Shot wears the same colour on the
 * left (screenplay) and right (cards). Per CONTEXT.md the marker is the
 * primary mental-model anchor — the colour is the visual reinforcement.
 *
 * Implementation: stable string hash → HSL hue rotation. The app runs a dark
 * theme (see :root in styles.css), so `accent` is a mid-lightness colour that
 * reads on the dark surface (card border, chip border, screenplay label) and
 * `background` is a *dark* tint that sits above the elevated surface without
 * washing out the light `--fg` body text. Pure function — no React, no DOM.
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
  /** Strong accent — used on card border, chip border, screenplay label. */
  accent: string;
  /**
   * Dark tinted background — used on the screenplay marker-block highlight.
   * Low lightness so the inherited light `--fg` body text stays readable on
   * the dark theme.
   */
  background: string;
  /** Hue degrees [0, 360). Exposed so consumers can derive related shades. */
  hue: number;
}

/**
 * Compute a colour for a Shot id. Deterministic across renders.
 *
 * Hue rotates the full circle. `accent` is mid-lightness (45%) so it reads on
 * the dark surface; `background` is a low-lightness (17%) tint that layers
 * over the elevated screenplay surface without hiding the light body text.
 */
export function shotPaletteColor(shotId: string): ShotPaletteColor {
  const hue = hashStr(shotId) % 360;
  return {
    accent: `hsl(${hue}, 65%, 45%)`,
    background: `hsl(${hue}, 45%, 17%)`,
    hue,
  };
}
