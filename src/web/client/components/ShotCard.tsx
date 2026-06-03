import { useEffect, useRef, useState } from "react";
import type {
  CharacterDto,
  CharacterRefDto,
  LocationDto,
  LocationRefDto,
  MovieDto,
  PropDto,
  PropRefDto,
  ShotDto,
  TakeDto,
} from "../../shared/dto.js";
import {
  acknowledgeShotRequest,
  acknowledgeTakeRequest,
  editShotCharacterRefs,
  editShotDuration,
  editShotLocationRefs,
  editShotPrompt,
  editShotPropRefs,
  toggleTakeStarred,
  uploadTake,
} from "../upload-client.js";
import { shotPaletteColor } from "../shot-palette.js";
import { StarButton } from "./StarButton.js";

interface Props {
  shot: ShotDto;
  sceneSlug: string;
  characters: readonly CharacterDto[];
  locations: readonly LocationDto[];
  props: readonly PropDto[];
  onTakeUploaded: () => void;
  onMovieChanged: (movie: MovieDto) => void;
}

/**
 * Per CONTEXT.md the Shot-level signal carries an emoji + text label so the
 * cue is colour-blind safe and screen-readable. The colour comes from CSS
 * (shot__status--<status>); the prefix is the human-language anchor.
 *
 * shot-stale → ⚠️ 각본 변경됨   (the screenplay drifted from when this Shot was authored)
 * take-stale → 🟡 구버전 Take    (Shot is current but at least one Take is on an older revision)
 * orphan     → 🟠 마커 없음     (no marker block in screenplay matches this Shot id)
 */
const SHOT_STATUS_LABEL: Record<ShotDto["syncStatus"], string> = {
  current: "in sync",
  "shot-stale": "⚠️ 각본 변경됨",
  "take-stale": "🟡 구버전 Take",
  orphan: "🟠 마커 없음",
};

const TAKE_STATUS_LABEL: Record<TakeDto["syncStatus"], string> = {
  current: "in sync",
  stale: "🟡 구버전 각본 기반",
  // Orphan at the parent Shot is surfaced on the Shot card; the Take card
  // intentionally stays neutral to avoid double-flagging the same condition.
  orphan: "",
};

// Mirrors the server-side video whitelist; reproduced here so we can hint the
// native file picker. The server is still the source of truth — bad
// extensions will be rejected with a 400.
const ACCEPT_VIDEO = "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov";

export function ShotCard({
  shot,
  sceneSlug,
  characters,
  locations,
  props,
  onTakeUploaded,
  onMovieChanged,
}: Props) {
  const [editing, setEditing] = useState(false);
  const palette = shotPaletteColor(shot.id);
  const accentStyle = {
    borderLeftColor: palette.accent,
  } as React.CSSProperties;

  const chips: { kind: string; label: string }[] = [];
  for (const r of shot.characterRefs) {
    chips.push({ kind: "char", label: `${r.character} / ${r.look}` });
  }
  for (const r of shot.locationRefs) {
    chips.push({
      kind: "loc",
      label: r.reference ? `${r.location} (${r.reference})` : r.location,
    });
  }
  for (const r of shot.propRefs) {
    chips.push({
      kind: "prop",
      label: r.reference ? `${r.prop} (${r.reference})` : r.prop,
    });
  }

  return (
    <article className="shot" data-shot-id={shot.id} style={accentStyle}>
      <header className="shot__header">
        <span
          className="shot__id"
          style={{ color: palette.accent, borderColor: palette.accent }}
        >
          Shot {shot.id}
        </span>
        <span className="shot__duration">{shot.duration}s</span>
        <span className={`shot__status shot__status--${shot.syncStatus}`}>
          {SHOT_STATUS_LABEL[shot.syncStatus]}
        </span>
        <ShotAcknowledgeButton
          shot={shot}
          sceneSlug={sceneSlug}
          onMovieChanged={onMovieChanged}
        />
        {!editing && (
          <button
            type="button"
            className="shot__edit-btn"
            onClick={() => setEditing(true)}
            title={`Edit Shot ${shot.id} meta`}
            aria-label={`Edit Shot ${shot.id}`}
          >
            Edit
          </button>
        )}
      </header>
      {editing ? (
        <ShotMetaEditor
          shot={shot}
          sceneSlug={sceneSlug}
          characters={characters}
          locations={locations}
          props={props}
          onClose={() => setEditing(false)}
          onMovieChanged={onMovieChanged}
        />
      ) : (
        <>
          <p className="shot__prompt">{shot.prompt}</p>
          {shot.prevShotRef !== undefined && (
            <div className="shot__prev">
              chained from Shot {shot.prevShotRef}
            </div>
          )}
          {chips.length > 0 && (
            <div className="shot__chips">
              {chips.map((c, i) => (
                <span
                  key={`${c.kind}-${i}`}
                  className={`chip chip--${c.kind}`}
                  title={c.kind}
                >
                  {c.label}
                </span>
              ))}
            </div>
          )}
        </>
      )}
      <TakesSection
        shot={shot}
        sceneSlug={sceneSlug}
        onTakeUploaded={onTakeUploaded}
        onMovieChanged={onMovieChanged}
      />
    </article>
  );
}

// ---------------------------------------------------------------------------
// ShotMetaEditor — inline editor for prompt / duration / refs (Slice 7).
//
// In-flight decisions:
//  - #6 Edit mode: card-level toggle (Edit/Save/Cancel per Shot), not per-field
//    toggle. Per-field churn would force more wiring + state per field with
//    no real benefit since prompt is the dominant edit.
//  - #3 Ref picker: inline dropdowns. Modal would be overkill — the library
//    is small and char/loc/prop names fit comfortably in a <select>. The
//    director never picks among hundreds of looks.
//  - Each field has its own Save button so a partial edit (e.g. just duration)
//    is one round-trip and stays on the same card. The "Done" button at the
//    bottom closes the editor — saves are independent.
// ---------------------------------------------------------------------------

function ShotMetaEditor({
  shot,
  sceneSlug,
  characters,
  locations,
  props,
  onClose,
  onMovieChanged,
}: {
  shot: ShotDto;
  sceneSlug: string;
  characters: readonly CharacterDto[];
  locations: readonly LocationDto[];
  props: readonly PropDto[];
  onClose: () => void;
  onMovieChanged: (movie: MovieDto) => void;
}) {
  return (
    <div className="shot-editor">
      <PromptEditor
        shot={shot}
        sceneSlug={sceneSlug}
        onMovieChanged={onMovieChanged}
      />
      <DurationEditor
        shot={shot}
        sceneSlug={sceneSlug}
        onMovieChanged={onMovieChanged}
      />
      <CharacterRefsEditor
        shot={shot}
        sceneSlug={sceneSlug}
        characters={characters}
        onMovieChanged={onMovieChanged}
      />
      <LocationRefsEditor
        shot={shot}
        sceneSlug={sceneSlug}
        locations={locations}
        onMovieChanged={onMovieChanged}
      />
      <PropRefsEditor
        shot={shot}
        sceneSlug={sceneSlug}
        props={props}
        onMovieChanged={onMovieChanged}
      />
      <div className="shot-editor__footer">
        <button
          type="button"
          className="shot-editor__done"
          onClick={onClose}
          title="Close editor"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function PromptEditor({
  shot,
  sceneSlug,
  onMovieChanged,
}: {
  shot: ShotDto;
  sceneSlug: string;
  onMovieChanged: (movie: MovieDto) => void;
}) {
  const [draft, setDraft] = useState(shot.prompt);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Re-sync draft when the underlying prompt changes (e.g. after another
  // edit refresh from the server).
  useEffect(() => {
    setDraft(shot.prompt);
  }, [shot.prompt]);

  const dirty = draft !== shot.prompt;
  async function save(): Promise<void> {
    setBusy(true);
    setErr(null);
    try {
      const m = await editShotPrompt(sceneSlug, shot.id, draft);
      onMovieChanged(m);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shot-editor__field">
      <label className="shot-editor__label" htmlFor={`prompt-${shot.id}`}>
        Prompt
      </label>
      <textarea
        id={`prompt-${shot.id}`}
        className="shot-editor__textarea"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={busy}
        rows={3}
        spellCheck={false}
      />
      <div className="shot-editor__row">
        <button
          type="button"
          className="shot-editor__save"
          onClick={() => void save()}
          disabled={busy || !dirty}
        >
          {busy ? "Saving…" : dirty ? "Save prompt" : "Saved"}
        </button>
        {err && <span className="shot-editor__error">{err}</span>}
      </div>
    </div>
  );
}

function DurationEditor({
  shot,
  sceneSlug,
  onMovieChanged,
}: {
  shot: ShotDto;
  sceneSlug: string;
  onMovieChanged: (movie: MovieDto) => void;
}) {
  const [draft, setDraft] = useState<string>(String(shot.duration));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setDraft(String(shot.duration));
  }, [shot.duration]);

  const parsed = Number.parseInt(draft, 10);
  const isValidInt = /^\d+$/.test(draft) && Number.isInteger(parsed);
  const inRange = isValidInt && parsed >= 4 && parsed <= 15;
  const dirty = isValidInt && parsed !== shot.duration;

  async function save(): Promise<void> {
    setBusy(true);
    setErr(null);
    try {
      const m = await editShotDuration(sceneSlug, shot.id, parsed);
      onMovieChanged(m);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shot-editor__field">
      <label className="shot-editor__label" htmlFor={`duration-${shot.id}`}>
        Duration (4-15s)
      </label>
      <div className="shot-editor__row">
        <input
          id={`duration-${shot.id}`}
          className="shot-editor__number"
          type="number"
          min={4}
          max={15}
          step={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={busy}
        />
        <span className="shot-editor__unit">s</span>
        <button
          type="button"
          className="shot-editor__save"
          onClick={() => void save()}
          disabled={busy || !dirty || !inRange}
          title={
            !isValidInt
              ? "Enter an integer"
              : !inRange
                ? "Duration must be 4-15"
                : ""
          }
        >
          {busy ? "Saving…" : dirty ? "Save duration" : "Saved"}
        </button>
        {!isValidInt && (
          <span className="shot-editor__error">integer required</span>
        )}
        {isValidInt && !inRange && (
          <span className="shot-editor__error">out of [4, 15]</span>
        )}
        {err && <span className="shot-editor__error">{err}</span>}
      </div>
    </div>
  );
}

function CharacterRefsEditor({
  shot,
  sceneSlug,
  characters,
  onMovieChanged,
}: {
  shot: ShotDto;
  sceneSlug: string;
  characters: readonly CharacterDto[];
  onMovieChanged: (movie: MovieDto) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function setRefs(
    next: CharacterRefDto[],
  ): Promise<void> {
    setBusy(true);
    setErr(null);
    try {
      const m = await editShotCharacterRefs(sceneSlug, shot.id, next);
      onMovieChanged(m);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(idx: number): Promise<void> {
    const next = shot.characterRefs.filter((_, i) => i !== idx);
    await setRefs(next);
  }

  async function add(character: string, look: string): Promise<void> {
    if (!character || !look) return;
    const next = [...shot.characterRefs, { character, look }];
    await setRefs(next);
  }

  return (
    <div className="shot-editor__field">
      <span className="shot-editor__label">Character refs</span>
      <ul className="shot-editor__refs">
        {shot.characterRefs.map((r, i) => (
          <li key={`${r.character}-${r.look}-${i}`} className="shot-editor__ref">
            <span>
              {r.character} / {r.look}
            </span>
            <button
              type="button"
              className="shot-editor__remove"
              onClick={() => void remove(i)}
              disabled={busy}
              aria-label={`Remove ${r.character} / ${r.look}`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <CharacterRefAdder
        characters={characters}
        onAdd={add}
        busy={busy}
      />
      {err && <div className="shot-editor__error">{err}</div>}
    </div>
  );
}

function CharacterRefAdder({
  characters,
  onAdd,
  busy,
}: {
  characters: readonly CharacterDto[];
  onAdd: (character: string, look: string) => Promise<void>;
  busy: boolean;
}) {
  const [character, setCharacter] = useState("");
  const [look, setLook] = useState("");
  const selectedChar = characters.find((c) => c.name === character);
  const looks = selectedChar?.looks ?? [];

  // Reset look when character changes — old look may not exist on new char.
  useEffect(() => {
    setLook("");
  }, [character]);

  if (characters.length === 0) {
    return (
      <div className="shot-editor__hint">
        No characters in library — add one in the Library page.
      </div>
    );
  }

  return (
    <div className="shot-editor__adder">
      <select
        className="shot-editor__select"
        value={character}
        onChange={(e) => setCharacter(e.target.value)}
        disabled={busy}
        aria-label="Character"
      >
        <option value="">— character —</option>
        {characters.map((c) => (
          <option key={c.name} value={c.name}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        className="shot-editor__select"
        value={look}
        onChange={(e) => setLook(e.target.value)}
        disabled={busy || !character}
        aria-label="Look"
      >
        <option value="">— look —</option>
        {looks.map((l) => (
          <option key={l.name} value={l.name}>
            {l.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="shot-editor__add"
        onClick={() => void onAdd(character, look)}
        disabled={busy || !character || !look}
      >
        Add
      </button>
    </div>
  );
}

function LocationRefsEditor({
  shot,
  sceneSlug,
  locations,
  onMovieChanged,
}: {
  shot: ShotDto;
  sceneSlug: string;
  locations: readonly LocationDto[];
  onMovieChanged: (movie: MovieDto) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draftLoc, setDraftLoc] = useState("");
  const [draftRef, setDraftRef] = useState("");

  async function setRefs(next: LocationRefDto[]): Promise<void> {
    setBusy(true);
    setErr(null);
    try {
      const m = await editShotLocationRefs(sceneSlug, shot.id, next);
      onMovieChanged(m);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(idx: number): Promise<void> {
    await setRefs(shot.locationRefs.filter((_, i) => i !== idx));
  }
  async function add(): Promise<void> {
    if (!draftLoc) return;
    const ref: LocationRefDto = draftRef
      ? { location: draftLoc, reference: draftRef }
      : { location: draftLoc };
    await setRefs([...shot.locationRefs, ref]);
    setDraftLoc("");
    setDraftRef("");
  }

  return (
    <div className="shot-editor__field">
      <span className="shot-editor__label">Location refs</span>
      <ul className="shot-editor__refs">
        {shot.locationRefs.map((r, i) => (
          <li
            key={`${r.location}-${r.reference ?? ""}-${i}`}
            className="shot-editor__ref"
          >
            <span>
              {r.location}
              {r.reference ? ` (${r.reference})` : ""}
            </span>
            <button
              type="button"
              className="shot-editor__remove"
              onClick={() => void remove(i)}
              disabled={busy}
              aria-label={`Remove ${r.location}`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {locations.length === 0 ? (
        <div className="shot-editor__hint">
          No locations in library — add one in the Library page.
        </div>
      ) : (
        <div className="shot-editor__adder">
          <select
            className="shot-editor__select"
            value={draftLoc}
            onChange={(e) => setDraftLoc(e.target.value)}
            disabled={busy}
            aria-label="Location"
          >
            <option value="">— location —</option>
            {locations.map((l) => (
              <option key={l.name} value={l.name}>
                {l.name}
              </option>
            ))}
          </select>
          <input
            className="shot-editor__refname"
            type="text"
            placeholder="angle (optional)"
            value={draftRef}
            onChange={(e) => setDraftRef(e.target.value)}
            disabled={busy || !draftLoc}
          />
          <button
            type="button"
            className="shot-editor__add"
            onClick={() => void add()}
            disabled={busy || !draftLoc}
          >
            Add
          </button>
        </div>
      )}
      {err && <div className="shot-editor__error">{err}</div>}
    </div>
  );
}

function PropRefsEditor({
  shot,
  sceneSlug,
  props,
  onMovieChanged,
}: {
  shot: ShotDto;
  sceneSlug: string;
  props: readonly PropDto[];
  onMovieChanged: (movie: MovieDto) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draftProp, setDraftProp] = useState("");
  const [draftRef, setDraftRef] = useState("");

  async function setRefs(next: PropRefDto[]): Promise<void> {
    setBusy(true);
    setErr(null);
    try {
      const m = await editShotPropRefs(sceneSlug, shot.id, next);
      onMovieChanged(m);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(idx: number): Promise<void> {
    await setRefs(shot.propRefs.filter((_, i) => i !== idx));
  }
  async function add(): Promise<void> {
    if (!draftProp) return;
    const ref: PropRefDto = draftRef
      ? { prop: draftProp, reference: draftRef }
      : { prop: draftProp };
    await setRefs([...shot.propRefs, ref]);
    setDraftProp("");
    setDraftRef("");
  }

  return (
    <div className="shot-editor__field">
      <span className="shot-editor__label">Prop refs</span>
      <ul className="shot-editor__refs">
        {shot.propRefs.map((r, i) => (
          <li
            key={`${r.prop}-${r.reference ?? ""}-${i}`}
            className="shot-editor__ref"
          >
            <span>
              {r.prop}
              {r.reference ? ` (${r.reference})` : ""}
            </span>
            <button
              type="button"
              className="shot-editor__remove"
              onClick={() => void remove(i)}
              disabled={busy}
              aria-label={`Remove ${r.prop}`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {props.length === 0 ? (
        <div className="shot-editor__hint">
          No props in library — add one in the Library page.
        </div>
      ) : (
        <div className="shot-editor__adder">
          <select
            className="shot-editor__select"
            value={draftProp}
            onChange={(e) => setDraftProp(e.target.value)}
            disabled={busy}
            aria-label="Prop"
          >
            <option value="">— prop —</option>
            {props.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            className="shot-editor__refname"
            type="text"
            placeholder="angle (optional)"
            value={draftRef}
            onChange={(e) => setDraftRef(e.target.value)}
            disabled={busy || !draftProp}
          />
          <button
            type="button"
            className="shot-editor__add"
            onClick={() => void add()}
            disabled={busy || !draftProp}
          >
            Add
          </button>
        </div>
      )}
      {err && <div className="shot-editor__error">{err}</div>}
    </div>
  );
}

function TakesSection({
  shot,
  sceneSlug,
  onTakeUploaded,
  onMovieChanged,
}: {
  shot: ShotDto;
  sceneSlug: string;
  onTakeUploaded: () => void;
  onMovieChanged: (movie: MovieDto) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await uploadTake(sceneSlug, shot.id, file);
      onTakeUploaded();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    // Reset so picking the same file twice still fires onChange.
    e.target.value = "";
  }

  const dropClass = [
    "takes__drop",
    dragOver ? "takes__drop--drag" : "",
    busy ? "takes__drop--busy" : "",
  ]
    .filter(Boolean)
    .join(" ");

  async function handleTakeStar(takeId: string, next: boolean): Promise<void> {
    const movie = await toggleTakeStarred(sceneSlug, shot.id, takeId, next);
    onMovieChanged(movie);
  }

  return (
    <div className="takes">
      {shot.takes.length > 0 && (
        <div className="takes__list">
          {shot.takes.map((t) => (
            <TakePlayer
              key={t.id}
              take={t}
              sceneSlug={sceneSlug}
              shotId={shot.id}
              onStarToggle={(next) => handleTakeStar(t.id, next)}
              onMovieChanged={onMovieChanged}
            />
          ))}
        </div>
      )}
      <div
        className={dropClass}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        title="Upload a take (mp4/webm/mov)"
      >
        <span className="takes__plus">+</span>
        <span className="takes__hint">
          {busy ? "uploading…" : "drop or click to upload Take"}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_VIDEO}
          style={{ display: "none" }}
          onChange={onPick}
        />
      </div>
      {error && <div className="takes__error">{error}</div>}
    </div>
  );
}

function TakePlayer({
  take,
  sceneSlug,
  shotId,
  onStarToggle,
  onMovieChanged,
}: {
  take: TakeDto;
  sceneSlug: string;
  shotId: string;
  onStarToggle: (next: boolean) => Promise<void>;
  onMovieChanged: (movie: MovieDto) => void;
}) {
  const staleLabel = TAKE_STATUS_LABEL[take.syncStatus];
  return (
    <figure
      className={`take-card take-card--sync-${take.syncStatus} ${take.isStarred ? "take-card--starred" : ""}`}
    >
      <video
        className="take-card__video"
        src={`/assets/${encodeURI(take.videoPath)}`}
        controls
        preload="metadata"
      />
      <figcaption className="take-card__caption">
        <span className="take-card__id">{take.id}</span>
        <StarButton
          isStarred={take.isStarred}
          onToggle={onStarToggle}
          title={
            take.isStarred
              ? "Unstar this Take"
              : `Set as starred Take for Shot ${shotId}`
          }
          ariaLabel={`Toggle Take ${take.id} starred (scene ${sceneSlug}, shot ${shotId})`}
          size="sm"
        />
        <time className="take-card__time" dateTime={take.createdAt}>
          {formatRelativeOrDate(take.createdAt)}
        </time>
      </figcaption>
      {take.syncStatus === "stale" && (
        <div className="take-card__sync">
          <span className="take-card__sync-badge" role="status">
            {staleLabel}
          </span>
          <TakeAcknowledgeButton
            sceneSlug={sceneSlug}
            shotId={shotId}
            takeId={take.id}
            onMovieChanged={onMovieChanged}
          />
        </div>
      )}
    </figure>
  );
}

/**
 * "Shot 확인됨" — pins Shot.screenplayHash to the current marker block hash.
 * Hidden on `current` (nothing to acknowledge) and `orphan` (no current hash
 * to acknowledge to — the director has to either re-add a marker or
 * delete the Shot from shots.yaml in Claude Code).
 *
 * `take-stale` is offered too — even though the Shot's own hash matches,
 * acknowledging from the Shot card is the natural quick action when the
 * director wants to clear the badge for the whole Shot. Visually clicking
 * "Shot 확인됨" on take-stale is a no-op on Shot.screenplayHash but the
 * server returns the same MovieDto so the UI stays consistent — and we
 * decided NOT to hide the button on take-stale because the user might
 * still want to use the per-Take "확인됨" buttons instead.
 *
 * Decision: only show on `shot-stale`. take-stale users use the per-Take
 * button which is the one that actually does something.
 */
function ShotAcknowledgeButton({
  shot,
  sceneSlug,
  onMovieChanged,
}: {
  shot: ShotDto;
  sceneSlug: string;
  onMovieChanged: (movie: MovieDto) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (shot.syncStatus !== "shot-stale") {
    return null;
  }
  async function onClick(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const movie = await acknowledgeShotRequest(sceneSlug, shot.id);
      onMovieChanged(movie);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="shot__ack-btn"
        onClick={() => void onClick()}
        disabled={busy}
        title={`Pin Shot ${shot.id}'s screenplayHash to the current marker block`}
      >
        {busy ? "확인 중…" : "Shot 확인됨"}
      </button>
      {error && (
        <span className="shot__ack-error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}

function TakeAcknowledgeButton({
  sceneSlug,
  shotId,
  takeId,
  onMovieChanged,
}: {
  sceneSlug: string;
  shotId: string;
  takeId: string;
  onMovieChanged: (movie: MovieDto) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function onClick(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const movie = await acknowledgeTakeRequest(sceneSlug, shotId, takeId);
      onMovieChanged(movie);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="take-card__ack-btn"
        onClick={() => void onClick()}
        disabled={busy}
        title={`Pin Take ${takeId}'s screenplayHash to the current marker block`}
      >
        {busy ? "확인 중…" : "Take 확인됨"}
      </button>
      {error && (
        <span className="take-card__ack-error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}

function formatRelativeOrDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  // Use short YYYY-MM-DD HH:MM in local time; we deliberately avoid a full
  // relative-time library — directors want timestamps, not "5 minutes ago".
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
