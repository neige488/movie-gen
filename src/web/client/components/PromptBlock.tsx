import { useLayoutEffect, useRef, useState } from "react";

/**
 * Reference/Shot prompt display: clamped by default with an inline 더보기/접기
 * toggle, plus an always-visible copy button. The 더보기 toggle only appears
 * when the text actually overflows the clamp (measured after layout), so short
 * prompts stay clean.
 */
export function PromptBlock({ prompt }: { prompt: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const [copied, setCopied] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);

  // Measure overflow against the clamped height. Re-runs when collapsed so the
  // toggle decision reflects the actual rendered text.
  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el || expanded) return;
    setOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [prompt, expanded]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail under insecure origins / denied permission.
      // Fall back to a transient selection so the user can copy manually.
      const el = textRef.current;
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  }

  return (
    <div className="prompt-block">
      <div
        ref={textRef}
        className={`prompt-block__text ${
          expanded ? "prompt-block__text--expanded" : ""
        }`}
      >
        {prompt}
      </div>
      <div className="prompt-block__actions">
        {overflowing && (
          <button
            type="button"
            className="prompt-block__toggle"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "접기" : "더보기"}
          </button>
        )}
        <button
          type="button"
          className="prompt-block__copy"
          onClick={copy}
          aria-label="프롬프트 복사"
        >
          {copied ? "복사됨 ✓" : "복사"}
        </button>
      </div>
    </div>
  );
}
