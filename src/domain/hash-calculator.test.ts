import { describe, expect, it } from "vitest";
import { computeScreenplayHash } from "./hash-calculator.js";

describe("computeScreenplayHash", () => {
  it("returns a 64-char hex sha-256 string", () => {
    const hash = computeScreenplayHash("hello world");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same input", () => {
    expect(computeScreenplayHash("abc")).toBe(computeScreenplayHash("abc"));
  });

  it("differs for different inputs", () => {
    expect(computeScreenplayHash("abc")).not.toBe(computeScreenplayHash("abd"));
  });

  it("normalizes leading/trailing whitespace (invariant hash)", () => {
    expect(computeScreenplayHash("hello")).toBe(computeScreenplayHash("  hello  "));
    expect(computeScreenplayHash("hello")).toBe(computeScreenplayHash("\n\nhello\n\n"));
  });

  it("normalizes CRLF / CR line endings to LF", () => {
    const lf = computeScreenplayHash("a\nb\nc");
    const crlf = computeScreenplayHash("a\r\nb\r\nc");
    const cr = computeScreenplayHash("a\rb\rc");
    expect(crlf).toBe(lf);
    expect(cr).toBe(lf);
  });

  it("preserves internal whitespace differences", () => {
    expect(computeScreenplayHash("a b")).not.toBe(computeScreenplayHash("a  b"));
  });
});
