import { useEffect, useRef, useState } from "react";
import type { MovieDto } from "../../shared/dto.js";
import { editSceneSlugline } from "../upload-client.js";
import { useEditorDirty } from "../live-reload.js";

interface Props {
  sceneSlug: string;
  slugline: string;
  onMovieChanged: (movie: MovieDto) => void;
}

/**
 * Inline slugline editor — click to edit, Enter or blur to save, Esc to cancel.
 *
 * Click the rendered slugline to switch to an input. Saves only if the value
 * changed (avoids spurious writes). Server is authoritative — the returned
 * MovieDto re-renders the parent.
 */
export function SluglineEditor({ sceneSlug, slugline, onMovieChanged }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(slugline);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Defer external auto-reloads while we're in edit mode (Slice 9).
  useEditorDirty(editing);

  useEffect(() => {
    if (editing) {
      setDraft(slugline);
      setError(null);
      // Focus + select all once mounted.
      const t = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [editing, slugline]);

  async function save(): Promise<void> {
    const next = draft.trim();
    if (!next) {
      setError("slugline cannot be empty");
      return;
    }
    if (next === slugline) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const movie = await editSceneSlugline(sceneSlug, next);
      onMovieChanged(movie);
      setEditing(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function cancel(): void {
    setDraft(slugline);
    setEditing(false);
    setError(null);
  }

  if (!editing) {
    return (
      <h2
        className="scene__slugline scene__slugline--editable"
        title="Click to edit slugline"
        onClick={() => setEditing(true)}
        tabIndex={0}
        role="button"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setEditing(true);
          }
        }}
      >
        {slugline}
      </h2>
    );
  }

  return (
    <div className="scene__slugline-edit">
      <input
        ref={inputRef}
        className="scene__slugline-input"
        type="text"
        value={draft}
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void save();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        onBlur={() => {
          if (!busy) void save();
        }}
        aria-label={`Edit slugline for scene ${sceneSlug}`}
      />
      {error && <div className="scene__slugline-error">{error}</div>}
    </div>
  );
}
