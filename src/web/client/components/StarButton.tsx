import { useState } from "react";

interface Props {
  isStarred: boolean;
  /** Called with the next value (the flipped boolean). Should perform the
   *  server round-trip and resolve / reject; the button shows a busy state
   *  while the promise is pending and rolls back visually on error. */
  onToggle: (next: boolean) => Promise<void>;
  title: string;
  ariaLabel: string;
  size?: "sm" | "md";
}

/**
 * Star toggle — ★ (filled, accent-warm) when starred / ☆ (outline, dim) when
 * not. Uses Unicode glyphs so we don't pull an icon library; the CSS in
 * `styles.css` upgrades the visual feedback.
 *
 * The component itself does NOT manage optimistic UI — it shows whichever
 * value the parent passes via `isStarred`. We picked server-driven over
 * optimistic because Take starred has a sibling auto-OFF side effect that's
 * easier to consume from a fresh server response than to mirror on the
 * client. The button DOES gate while a request is in flight to prevent
 * double-toggles.
 */
export function StarButton({
  isStarred,
  onToggle,
  title,
  ariaLabel,
  size = "md",
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function click(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onToggle(!isStarred);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const classes = [
    "star-btn",
    isStarred ? "star-btn--on" : "star-btn--off",
    busy ? "star-btn--busy" : "",
    size === "sm" ? "star-btn--sm" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={classes}
      onClick={() => void click()}
      aria-label={ariaLabel}
      aria-pressed={isStarred}
      title={error ?? title}
      disabled={busy}
    >
      <span className="star-btn__glyph" aria-hidden="true">
        {isStarred ? "★" : "☆"}
      </span>
    </button>
  );
}
