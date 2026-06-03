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
