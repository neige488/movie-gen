import type { ShotDto } from "../../shared/dto.js";

interface Props {
  shot: ShotDto;
}

const STATUS_LABEL: Record<ShotDto["syncStatus"], string> = {
  current: "in sync",
  "shot-stale": "shot stale",
  "take-stale": "take stale",
  orphan: "orphan",
};

export function ShotCard({ shot }: Props) {
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
      {shot.takes.length > 0 && (
        <div className="shot__takes">
          {shot.takes.map((t) => (
            <span
              key={t.id}
              className={`take ${t.isStarred ? "take--starred" : ""}`}
            >
              {t.isStarred ? "★ " : ""}
              {t.id}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}
