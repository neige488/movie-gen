import type { LibraryCharacterDto, ImageReferenceDto } from "../../shared/dto.js";
import { ImageSlot } from "./ImageSlot.js";
import { PromptBlock } from "./PromptBlock.js";

interface Props {
  character: LibraryCharacterDto;
  onUploaded: () => void;
}

/**
 * Small `@refName` label shown next to a slot when the ImageRef has one.
 * NB: the prop is `imageRef`, NOT `ref` — `ref` is a reserved prop on React 18
 * function components (React swallows it instead of passing it through), which
 * silently made every label disappear.
 */
function RefName({ imageRef }: { imageRef?: ImageReferenceDto }) {
  if (!imageRef?.refName) return null;
  return <span className="look__refname">@{imageRef.refName}</span>;
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
          <div className="look__group-label">
            headshot (face ID)
            <RefName imageRef={character.headshot} />
          </div>
          <ImageSlot
            slot={{ kind: "character-headshot", character: character.name }}
            imagePath={character.headshot.image}
            label="headshot"
            onUploaded={onUploaded}
          />
          {character.headshot.prompt && (
            <PromptBlock prompt={character.headshot.prompt} />
          )}
        </div>
      </header>
      <div className="card__looks">
        {character.looks.map((look) => (
          <div key={look.name} className="look">
            <h4 className="look__name">{look.name}</h4>
            <div className="look__row">
              <div className="look__group">
                <div className="look__group-label">
                  Uniform (2-panel 앞뒤)
                  <RefName imageRef={look.uniform} />
                </div>
                <ImageSlot
                  slot={{
                    kind: "character-uniform",
                    character: character.name,
                    look: look.name,
                  }}
                  imagePath={look.uniform?.image ?? ""}
                  label="uniform"
                  onUploaded={onUploaded}
                />
                {look.uniform?.prompt && (
                  <PromptBlock prompt={look.uniform.prompt} />
                )}
              </div>
              <div className="look__group">
                <div className="look__group-label">
                  Sheet (3-panel 통합)
                  <RefName imageRef={look.sheet} />
                </div>
                <ImageSlot
                  slot={{
                    kind: "character-sheet",
                    character: character.name,
                    look: look.name,
                  }}
                  imagePath={look.sheet?.image ?? ""}
                  label="sheet"
                  onUploaded={onUploaded}
                />
                {look.sheet?.prompt && <PromptBlock prompt={look.sheet.prompt} />}
              </div>
              <div className="look__group">
                <div className="look__group-label">
                  Face (5-panel sheet)
                  <RefName imageRef={look.face} />
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
                {look.face.prompt && <PromptBlock prompt={look.face.prompt} />}
              </div>
              <div className="look__group">
                <div className="look__group-label">
                  Body (3-panel sheet)
                  <RefName imageRef={look.body} />
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
                {look.body.prompt && <PromptBlock prompt={look.body.prompt} />}
              </div>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
