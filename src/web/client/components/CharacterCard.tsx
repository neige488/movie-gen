import { useState } from "react";
import type { LibraryCharacterDto, VoiceReferenceDto } from "../../shared/dto.js";
import { ImageSlot } from "./ImageSlot.js";
import { VideoSlot } from "./VideoSlot.js";
import { PromptBlock } from "./PromptBlock.js";
import { blackifyVoice } from "../upload-client.js";

interface Props {
  character: LibraryCharacterDto;
  onUploaded: () => void;
}

/**
 * Small `@refName` label shown next to a slot when the ref has one. Takes the
 * `refName` string directly — do NOT name the prop `ref` (reserved on React 18
 * function components; React swallows it, which once made every label vanish).
 */
function RefName({ refName }: { refName?: string }) {
  if (!refName) return null;
  return <span className="look__refname">@{refName}</span>;
}

/**
 * Voice reference (character-level): a ≈15s self-intro video + its generation
 * prompt + an optional ffmpeg-derived "black screen + audio only" clip. The
 * blackify button asks the server to run ffmpeg on the source video; on
 * success it refreshes the library (parent's onUploaded) so the derived clip
 * appears. ffmpeg-missing / no-source errors surface inline.
 */
function VoiceSection({
  characterName,
  voice,
  onUploaded,
}: {
  characterName: string;
  voice?: VoiceReferenceDto;
  onUploaded: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onBlackify(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await blackifyVoice(characterName);
      onUploaded();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const hasSource = Boolean(voice?.video);

  return (
    <div className="card__voice">
      <div className="look__group-label">
        Voice (자기소개 영상)
        <RefName refName={voice?.refName} />
      </div>
      <VideoSlot
        slot={{ kind: "character-voice", character: characterName }}
        videoPath={voice?.video ?? ""}
        label="voice"
        onUploaded={onUploaded}
      />
      {voice?.prompt && <PromptBlock prompt={voice.prompt} />}
      <div className="card__voice-black">
        <button
          type="button"
          className="slot__upload"
          onClick={() => void onBlackify()}
          disabled={busy || !hasSource}
          title={
            hasSource
              ? "원본에서 검은 화면 + 음성만 영상을 생성 (ffmpeg)"
              : "먼저 자기소개 영상을 업로드하세요"
          }
        >
          {busy ? "변환 중…" : "🎙 검은화면 + 음성 추출"}
        </button>
        {voice?.blackVideo && (
          <video
            className="slot__video card__voice-blackvid"
            src={`/assets/${encodeURI(voice.blackVideo)}`}
            controls
            preload="metadata"
          />
        )}
        {error && <div className="slot__toast slot__toast--error">{error}</div>}
      </div>
    </div>
  );
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
            <RefName refName={character.headshot.refName} />
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
        <VoiceSection
          characterName={character.name}
          voice={character.voice}
          onUploaded={onUploaded}
        />
      </header>
      <div className="card__looks">
        {character.looks.map((look) => (
          <div key={look.name} className="look">
            <h4 className="look__name">{look.name}</h4>
            <div className="look__row">
              <div className="look__group">
                <div className="look__group-label">
                  Uniform (2-panel 앞뒤)
                  <RefName refName={look.uniform?.refName} />
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
                  Face (5-panel sheet)
                  <RefName refName={look.face.refName} />
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
                  <RefName refName={look.body.refName} />
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
