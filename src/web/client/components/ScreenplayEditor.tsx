import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { MovieDto } from "../../shared/dto.js";
import { editSceneScreenplay } from "../upload-client.js";
import {
  missingMarkerShotIds,
  segmentScreenplay,
} from "../screenplay-segments.js";
import { shotPaletteColor } from "../shot-palette.js";
import { useEditorDirty } from "../live-reload.js";

interface Props {
  sceneSlug: string;
  /** Raw screenplay markdown (with HTML comment markers). */
  screenplay: string;
  /** Shot ids declared in shots.yaml — used to detect missing markers. */
  shotIds: readonly string[];
  onMovieChanged: (movie: MovieDto) => void;
}

/**
 * Markdown editor for `screenplay.md`. Switches between two modes:
 *  - read:  marker-aware visualization. Each shot block is rendered with a
 *           tinted background + "Shot N" label in the Shot's palette colour;
 *           uncovered prose (between marker pairs) shows a subdued grey "마커
 *           없음" background. ReactMarkdown renders the body of each segment
 *           so headings/dialogue still format normally.
 *  - edit:  raw textarea (markers visible — the director must preserve them)
 *
 * Decisions (PR In-flight #4, #5 — Slice 7):
 *  - Marker block colour: hashed from shotId via `shotPaletteColor` — the
 *    same hue used by the matching ShotCard's accent so the eye can match
 *    screenplay region ↔ Shot card at a glance.
 *  - Missing-marker visualization: subdued grey background, not a dotted
 *    outline. Outlines fought with markdown's own border rules; a soft
 *    background reads as "this prose belongs to no Shot" without screaming.
 *  - Mismatch warning: a banner above the screenplay listing shotIds present
 *    in shots.yaml but missing from the markdown ("⚠️ no marker block for
 *    Shot N"). Surfaces what `validateMarkerConsistency` would reject on
 *    save, but as a read-only hint.
 *  - Plain textarea in edit mode (no editor library — same as Slice 5).
 *  - Explicit Save button (no auto-save). Dirty indicator next to Save.
 *  - Strict marker validation still lives server-side; client renders any
 *    400 error message verbatim.
 */

export function ScreenplayEditor({
  sceneSlug,
  screenplay,
  shotIds,
  onMovieChanged,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(screenplay);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Defer external auto-reloads while we're in edit mode (Slice 9).
  useEditorDirty(editing);

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
    const segments = segmentScreenplay(screenplay);
    const missing = missingMarkerShotIds(segments, shotIds);
    return (
      <div className="scene__screenplay-block">
        {missing.length > 0 && (
          <div
            className="scene__marker-warning"
            role="alert"
            aria-live="polite"
          >
            ⚠️ shots.yaml에 있지만 본문에 마커가 없는 Shot:{" "}
            {missing.map((id) => (
              <span key={id} className="scene__marker-missing-id">
                Shot {id}
              </span>
            ))}
          </div>
        )}
        <div className="scene__screenplay scene__screenplay--marker-view">
          {segments.map((seg, i) => {
            if (seg.kind === "shot") {
              const palette = shotPaletteColor(seg.shotId);
              return (
                <div
                  key={`shot-${i}-${seg.shotId}`}
                  className="marker-block"
                  style={{
                    backgroundColor: palette.background,
                    borderLeftColor: palette.accent,
                  }}
                  data-shot-id={seg.shotId}
                >
                  <span
                    className="marker-block__label"
                    style={{ color: palette.accent }}
                  >
                    Shot {seg.shotId}
                  </span>
                  <div className="marker-block__body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {seg.text}
                    </ReactMarkdown>
                  </div>
                </div>
              );
            }
            return (
              <div
                key={`gap-${i}`}
                className="marker-block marker-block--gap"
                title="마커 없음 — 어느 Shot에도 매핑되지 않은 영역"
              >
                <span className="marker-block__label marker-block__label--gap">
                  마커 없음
                </span>
                <div className="marker-block__body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {seg.text}
                  </ReactMarkdown>
                </div>
              </div>
            );
          })}
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
