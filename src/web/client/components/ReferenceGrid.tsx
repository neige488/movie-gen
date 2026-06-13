import type { ImageReferenceDto } from "../../shared/dto.js";
import { ImageSlot } from "./ImageSlot.js";
import { PromptBlock } from "./PromptBlock.js";

interface Props {
  kind: "location" | "prop";
  name: string;
  references: ImageReferenceDto[];
  onUploaded: () => void;
}

export function ReferenceGrid({ kind, name, references, onUploaded }: Props) {
  return (
    <article className="card card--ref">
      <header className="card__header">
        <div className="card__title">
          <span className="card__name">{name}</span>
          <span className="card__sub">
            {references.length} reference
            {references.length === 1 ? "" : "s"}
          </span>
        </div>
      </header>
      {references.length === 0 ? (
        <div className="card__empty">
          No references defined. Add a reference in <code>data/{kind}s/{name}.yaml</code>{" "}
          then upload images here.
        </div>
      ) : (
        <div className="card__refs">
          {references.map((r) => (
            <div key={r.name} className="ref">
              <ImageSlot
                slot={
                  kind === "location"
                    ? {
                        kind: "location-ref",
                        location: name,
                        refName: r.name,
                      }
                    : { kind: "prop-ref", prop: name, refName: r.name }
                }
                imagePath={r.image}
                label={r.name}
                onUploaded={onUploaded}
              />
              <PromptBlock prompt={r.prompt} />
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
