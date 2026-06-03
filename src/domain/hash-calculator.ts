import { createHash } from "node:crypto";

/**
 * Normalize the text body of a screenplay marker block before hashing.
 *
 * Rules (per CONTEXT.md "Screenplay hash"):
 * - Trim leading/trailing whitespace.
 * - Normalize CRLF (\r\n) and CR (\r) line endings to LF (\n).
 *
 * Internal whitespace differences (e.g. "a b" vs "a  b") are preserved —
 * they are meaningful in screenplays.
 */
export function normalizeScreenplayText(text: string): string {
  return text.replace(/\r\n?/g, "\n").trim();
}

/**
 * Compute the SHA-256 hash of normalized screenplay text.
 *
 * Returns a lowercase 64-char hex string. Used to track whether a Shot/Take
 * is still based on the current screenplay marker block contents.
 */
export function computeScreenplayHash(text: string): string {
  const normalized = normalizeScreenplayText(text);
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}
