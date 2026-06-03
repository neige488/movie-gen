/**
 * Screenplay segmentation for the Marker visualization (Slice 7).
 *
 * Splits a raw screenplay (with `<!-- shot:NN -->` ... `<!-- /shot:NN -->`
 * HTML comment markers) into a flat list of segments in source order:
 *
 *   - `kind: "shot"`   — text inside an open/close marker pair, tagged with
 *                        the Shot id. Multiple disjoint blocks for the same
 *                        Shot id each appear as their own segment (CONTEXT.md
 *                        "한 Shot이 여러 블록 가능").
 *   - `kind: "gap"`    — text outside any marker (the "마커 누락 영역" — grey
 *                        background in the UI).
 *
 * The function is intentionally permissive: malformed or unbalanced markers
 * degrade gracefully (the offending region falls into a gap) so the UI can
 * still render something useful while the director fixes the markdown. The
 * authoritative parse with errors lives in `parseShotMarkers` (server-side
 * — Light edit endpoint rejects mismatched marker sets).
 *
 * No new vocabulary is introduced (per CONTEXT.md guidelines): segments
 * carry the existing `shotId` field, and "gap" is internal jargon for the UI
 * — the on-screen label uses "마커 없음" / "uncovered".
 */

export type ScreenplaySegment =
  | { kind: "shot"; shotId: string; text: string }
  | { kind: "gap"; text: string };

const OPEN_RE = /<!--\s*shot:([^\s/]+)\s*-->/;
const CLOSE_RE = /<!--\s*\/shot:([^\s]+)\s*-->/;

export function segmentScreenplay(markdown: string): ScreenplaySegment[] {
  const lines = markdown.split(/\r\n?|\n/);
  const out: ScreenplaySegment[] = [];

  let inShot: string | null = null;
  let buf: string[] = [];

  function flush(kind: "shot" | "gap", shotId?: string): void {
    if (buf.length === 0) return;
    const text = buf.join("\n");
    // Drop pure-whitespace gaps; they add visual noise.
    if (kind === "gap" && text.trim().length === 0) {
      buf = [];
      return;
    }
    if (kind === "shot") {
      out.push({ kind: "shot", shotId: shotId!, text });
    } else {
      out.push({ kind: "gap", text });
    }
    buf = [];
  }

  for (const line of lines) {
    const closeMatch = line.match(CLOSE_RE);
    const openMatch = line.match(OPEN_RE);

    if (closeMatch && inShot && closeMatch[1] === inShot) {
      flush("shot", inShot);
      inShot = null;
      continue;
    }
    if (closeMatch && !inShot) {
      // Unmatched close — treat as gap material so the UI doesn't drop it.
      buf.push(line);
      continue;
    }
    if (openMatch && !inShot) {
      flush("gap");
      inShot = openMatch[1]!;
      continue;
    }
    if (openMatch && inShot) {
      // Nested open — close the current shot defensively, then open the new one.
      flush("shot", inShot);
      inShot = openMatch[1]!;
      continue;
    }
    buf.push(line);
  }

  if (inShot !== null) {
    // Unclosed marker — flush the partial block as a shot segment so the
    // director still sees the colour, then surface the remainder as gap (none
    // here, since we already drained buf into the shot).
    flush("shot", inShot);
  } else {
    flush("gap");
  }
  return out;
}

/**
 * Compute the set of Shot IDs that appear in `expectedShotIds` (from
 * `shots.yaml`) but do NOT appear in any "shot" segment of the screenplay.
 * Used by the UI to render "shots.yaml mismatched" warnings — the director
 * has a Shot record but no marker block to attach it to.
 *
 * Sorted alphanumerically for stable display.
 */
export function missingMarkerShotIds(
  segments: readonly ScreenplaySegment[],
  expectedShotIds: readonly string[],
): string[] {
  const present = new Set<string>();
  for (const s of segments) {
    if (s.kind === "shot") present.add(s.shotId);
  }
  return [...expectedShotIds]
    .filter((id) => !present.has(id))
    .sort((a, b) => a.localeCompare(b));
}
