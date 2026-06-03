import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { MovieDto } from "../../shared/dto.js";
import { editSceneScreenplay } from "../upload-client.js";

interface Props {
  sceneSlug: string;
  /** Raw screenplay markdown (with HTML comment markers). */
  screenplay: string;
  onMovieChanged: (movie: MovieDto) => void;
}

/**
 * Markdown editor for `screenplay.md`. Switches between two modes:
 *  - read:  rendered markdown (markers stripped, ReactMarkdown)
 *  - edit:  raw textarea (markers visible — the director must preserve them)
 *
 * Decisions (PR In-flight #1, #4):
 *  - Plain textarea (no editor library). The Light edit slice is intentionally
 *    minimal; rich editing belongs in Claude Code.
 *  - Explicit Save button (no auto-save). A "dirty" indicator next to Save
 *    surfaces unsaved state.
 *  - Strict marker validation lives server-side; the client just renders any
 *    400 error message verbatim.
 */
function stripShotMarkers(text: string): string {
  return text.replace(/<!--\s*\/?shot:[^\s]+\s*-->\n?/g, "");
}

export function ScreenplayEditor({
  sceneSlug,
  screenplay,
  onMovieChanged,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(screenplay);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Reset the draft whenever we enter edit mode or the source text changes
  // from outside (e.g. a refresh).
  useEffect(() => {
    if (editing) {
      setDraft(screenplay);
      setError(null);
      const t = setTimeout(() => {
        taRef.current?.focus();
      }, 0);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [editing, screenplay]);

  const isDirty = editing && draft !== screenplay;

  async function save(): Promise<void> {
    if (draft === screenplay) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const movie = await editSceneScreenplay(sceneSlug, draft);
      onMovieChanged(movie);
      setEditing(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function cancel(): void {
    setDraft(screenplay);
    setEditing(false);
    setError(null);
  }

  if (!editing) {
    return (
      <div className="scene__screenplay-block">
        <div className="scene__screenplay">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {stripShotMarkers(screenplay)}
          </ReactMarkdown>
        </div>
        <button
          type="button"
          className="scene__screenplay-edit-btn"
          onClick={() => setEditing(true)}
          aria-label={`Edit screenplay for scene ${sceneSlug}`}
        >
          Edit screenplay
        </button>
      </div>
    );
  }

  return (
    <div className="scene__screenplay-block scene__screenplay-block--editing">
      <div className="scene__editor-toolbar">
        <span className="scene__editor-label">
          Editing markdown — preserve <code>&lt;!-- shot:NN --&gt;</code> markers
          {isDirty ? <span className="scene__editor-dirty">●</span> : null}
        </span>
        <div className="scene__editor-actions">
          <button
            type="button"
            className="scene__editor-cancel"
            onClick={cancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="scene__editor-save"
            onClick={() => void save()}
            disabled={busy || !isDirty}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      <textarea
        ref={taRef}
        className="scene__screenplay-textarea"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={busy}
        spellCheck={false}
        aria-label={`Screenplay editor for scene ${sceneSlug}`}
      />
      {error && <div className="scene__editor-error">{error}</div>}
    </div>
  );
}
