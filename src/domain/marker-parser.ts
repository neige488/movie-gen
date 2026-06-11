/**
 * Screenplay marker parser.
 *
 * Per CONTEXT.md: `<!-- shot:NN -->` ... `<!-- /shot:NN -->` HTML comment
 * blocks inside `screenplay.md` declare which Shot each region of the
 * screenplay belongs to. Markers are invisible in rendered Markdown.
 *
 * Rules:
 * - Nested markers are forbidden.
 * - Unclosed open markers are forbidden.
 * - Close without matching open is forbidden.
 * - Mismatched open/close ids are forbidden.
 * - The same Shot id may appear in multiple disjoint blocks.
 * - Shot id must be numeric (digits only); zero-padding allowed.
 */

export interface MarkerBlock {
  readonly shotId: string;
  /** Raw text between the open and close markers (newlines preserved). */
  readonly text: string;
  /** 1-based line number of the opening marker. */
  readonly openLine: number;
  /** 1-based line number of the closing marker. */
  readonly closeLine: number;
}

export class MarkerParseError extends Error {
  public readonly line: number;
  public override readonly name = "MarkerParseError";

  constructor(message: string, line: number) {
    super(`Marker parse error at line ${line}: ${message}`);
    this.line = line;
  }
}

const OPEN_RE = /<!--\s*shot:([^\s/]+)\s*-->/;
const CLOSE_RE = /<!--\s*\/shot:([^\s]+)\s*-->/;

export function parseShotMarkers(markdown: string): MarkerBlock[] {
  const lines = markdown.split(/\r\n?|\n/);
  const blocks: MarkerBlock[] = [];

  let openShotId: string | null = null;
  let openLine: number = 0;
  let bodyStartLine: number = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const oneBased = i + 1;

    const closeMatch = line.match(CLOSE_RE);
    const openMatch = line.match(OPEN_RE);

    // Close markers take precedence on the same line (rare edge), so check
    // them first to surface unmatched-close errors clearly.
    if (closeMatch) {
      const closeId = closeMatch[1]!;
      validateShotId(closeId, oneBased);
      if (openShotId === null) {
        throw new MarkerParseError(
          `unmatched close marker — no open for shot:${closeId}`,
          oneBased,
        );
      }
      if (openShotId !== closeId) {
        throw new MarkerParseError(
          `mismatched close — opened shot:${openShotId} but found /shot:${closeId}`,
          oneBased,
        );
      }
      const bodyLines = lines.slice(bodyStartLine, i);
      blocks.push({
        shotId: openShotId,
        text: bodyLines.join("\n"),
        openLine,
        closeLine: oneBased,
      });
      openShotId = null;
      continue;
    }

    if (openMatch) {
      const openId = openMatch[1]!;
      validateShotId(openId, oneBased);
      if (openShotId !== null) {
        throw new MarkerParseError(
          `nested shot markers not allowed — shot:${openShotId} is still open`,
          oneBased,
        );
      }
      openShotId = openId;
      openLine = oneBased;
      bodyStartLine = i + 1;
    }
  }

  if (openShotId !== null) {
    throw new MarkerParseError(
      `unclosed shot marker shot:${openShotId}`,
      openLine,
    );
  }

  return blocks;
}

function validateShotId(id: string, line: number): void {
  if (!/^\d+$/.test(id)) {
    throw new MarkerParseError(
      `invalid shot id "${id}" — must be digits only`,
      line,
    );
  }
}

// ---------------------------------------------------------------------------
// validateMarkerConsistency — strict shotId set guard for Light edit (Slice 5)
// ---------------------------------------------------------------------------

/**
 * Raised when an edited screenplay's marker shotId set diverges from the
 * Shot list defined in `shots.yaml`. Different from `MarkerParseError`
 * (structural) so the HTTP layer can return a consistent 4xx shape for both
 * structural and consistency failures (it can catch this superclass-of-base
 * by name).
 */
export class MarkerConsistencyError extends Error {
  public override readonly name = "MarkerConsistencyError";
}

/**
 * Validate that a candidate screenplay's marker shot IDs match an expected
 * set exactly. Used when the director edits `screenplay.md` from the web —
 * adding/removing Shots is out of scope for the Light edit slice (Claude
 * Code is the recommended authoring path for that), so we reject any drift.
 *
 * Rules (strict):
 *  - Structural parse must succeed (delegates to `parseShotMarkers`). Parse
 *    failures are re-raised as `MarkerConsistencyError` so callers handle one
 *    error category.
 *  - The set of distinct shot IDs in the markdown must equal
 *    `expectedShotIds` (set equality; duplicates within the markdown are
 *    allowed — multi-block Shots are legitimate).
 *  - Missing IDs (expected but absent) and unexpected IDs (present but not
 *    expected) both reject, with both lists surfaced in the message so the
 *    user sees the full diff at once.
 */
export function validateMarkerConsistency(
  markdown: string,
  expectedShotIds: readonly string[],
): void {
  let blocks;
  try {
    blocks = parseShotMarkers(markdown);
  } catch (err) {
    if (err instanceof MarkerParseError) {
      throw new MarkerConsistencyError(
        `screenplay markers are malformed — ${err.message}`,
      );
    }
    throw err;
  }

  const present = new Set(blocks.map((b) => b.shotId));
  const expected = new Set(expectedShotIds);

  const missing: string[] = [];
  for (const id of expected) {
    if (!present.has(id)) missing.push(id);
  }
  const unexpected: string[] = [];
  for (const id of present) {
    if (!expected.has(id)) unexpected.push(id);
  }

  if (missing.length === 0 && unexpected.length === 0) return;

  const parts: string[] = [];
  if (missing.length > 0) {
    parts.push(`missing shot markers: ${missing.sort().join(", ")}`);
  }
  if (unexpected.length > 0) {
    parts.push(`unexpected shot markers: ${unexpected.sort().join(", ")}`);
  }
  throw new MarkerConsistencyError(parts.join("; "));
}
