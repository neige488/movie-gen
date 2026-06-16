import type { LibraryCharacterDto } from "../../shared/dto.js";
import { ImageSlot } from "./ImageSlot.js";

interface Props {
  character: LibraryCharacterDto;
  onUploaded: () => void;
}

export function CharacterCard({ character, onUploaded }: Props) {
  return (
    <article className="card card--character">
      <header className="card__header">
        <div className="card__title">
          <span className="card__name">{character.name}</span>
          <span className="card__sub">
            {character.looks.length} look
            {character.looks.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="card__headshot">
          <ImageSlot
            slot={{ kind: "character-headshot", character: character.name }}
            imagePath={character.headshot}
            label="headshot"
            onUploaded={onUploaded}
          />
        </div>
      </header>
      <div className="card__looks">
        {character.looks.map((look) => (
          <div key={look.name} className="look">
            <h4 className="look__name">{look.name}</h4>
            <div className="look__row">
              <div className="look__group">
                <div className="look__group-label">
                  Face (5-panel sheet)
                  {look.face.refName && (
                    <span className="look__refname">@{look.face.refName}</span>
                  )}
                </div>
                <ImageSlot
                  slot={{
                    kind: "character-face",
                    character: character.name,
                    look: look.name,
                  }}
                  imagePath={look.face.image}
                  label="face"
                  onUploaded={onUploaded}
                />
              </div>
              <div className="look__group">
                <div className="look__group-label">
                  Body (3-panel sheet)
                  {look.body.refName && (
                    <span className="look__refname">@{look.body.refName}</span>
                  )}
                </div>
                <ImageSlot
                  slot={{
                    kind: "character-body",
                    character: character.name,
                    look: look.name,
                  }}
                  imagePath={look.body.image}
                  label="body"
                  onUploaded={onUploaded}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
