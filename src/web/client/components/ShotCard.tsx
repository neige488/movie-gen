import { useRef, useState } from "react";
import type { MovieDto, ShotDto, TakeDto } from "../../shared/dto.js";
import {
  acknowledgeShotRequest,
  acknowledgeTakeRequest,
  toggleTakeStarred,
  uploadTake,
} from "../upload-client.js";
import { StarButton } from "./StarButton.js";

interface Props {
  shot: ShotDto;
  sceneSlug: string;
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
  onTakeUploaded,
  onMovieChanged,
}: Props) {
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
    <article className="shot" data-shot-id={shot.id}>
      <header className="shot__header">
        <span className="shot__id">Shot {shot.id}</span>
        <span className="shot__duration">{shot.duration}s</span>
        <span className={`shot__status shot__status--${shot.syncStatus}`}>
          {SHOT_STATUS_LABEL[shot.syncStatus]}
        </span>
        <ShotAcknowledgeButton
          shot={shot}
          sceneSlug={sceneSlug}
          onMovieChanged={onMovieChanged}
        />
      </header>
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
      <TakesSection
        shot={shot}
        sceneSlug={sceneSlug}
        onTakeUploaded={onTakeUploaded}
        onMovieChanged={onMovieChanged}
      />
    </article>
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
