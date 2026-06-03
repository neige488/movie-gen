import { useRef, useState } from "react";
import type { MovieDto, ShotDto, TakeDto } from "../../shared/dto.js";
import { toggleTakeStarred, uploadTake } from "../upload-client.js";
import { StarButton } from "./StarButton.js";

interface Props {
  shot: ShotDto;
  sceneSlug: string;
  onTakeUploaded: () => void;
  onMovieChanged: (movie: MovieDto) => void;
}

const STATUS_LABEL: Record<ShotDto["syncStatus"], string> = {
  current: "in sync",
  "shot-stale": "shot stale",
  "take-stale": "take stale",
  orphan: "orphan",
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
          {STATUS_LABEL[shot.syncStatus]}
        </span>
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
}: {
  take: TakeDto;
  sceneSlug: string;
  shotId: string;
  onStarToggle: (next: boolean) => Promise<void>;
}) {
  return (
    <figure
      className={`take-card ${take.isStarred ? "take-card--starred" : ""}`}
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
    </figure>
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
