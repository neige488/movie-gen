import type { LibraryCharacterDto } from "../../shared/dto.js";
import { ImageSlot } from "./ImageSlot.js";

interface Props {
  character: LibraryCharacterDto;
  onUploaded: () => void;
}

const FACE_SLOTS = 5;
const BODY_SLOTS = 3;

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
            <div className="look__group">
              <div className="look__group-label">Face ({FACE_SLOTS})</div>
              <div className="look__row">
                {Array.from({ length: FACE_SLOTS }, (_, i) => (
                  <ImageSlot
                    key={`face-${i}`}
                    slot={{
                      kind: "character-face",
                      character: character.name,
                      look: look.name,
                      index: i,
                    }}
                    imagePath={look.faceImages[i] ?? ""}
                    label={`face-${i}`}
                    onUploaded={onUploaded}
                  />
                ))}
              </div>
            </div>
            <div className="look__group">
              <div className="look__group-label">Body ({BODY_SLOTS})</div>
              <div className="look__row">
                {Array.from({ length: BODY_SLOTS }, (_, i) => (
                  <ImageSlot
                    key={`body-${i}`}
                    slot={{
                      kind: "character-body",
                      character: character.name,
                      look: look.name,
                      index: i,
                    }}
                    imagePath={look.bodyImages[i] ?? ""}
                    label={`body-${i}`}
                    onUploaded={onUploaded}
                  />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
