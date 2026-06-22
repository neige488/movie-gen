import { useEffect, useRef, useState } from "react";
import type { AssetSlotSpec } from "../upload-client.js";
import { uploadAsset } from "../upload-client.js";

interface Props {
  slot: AssetSlotSpec;
  /** Relative path under assets root. Empty string ⇒ unset slot. */
  imagePath: string;
  label?: string;
  onUploaded: () => void;
}

/**
 * One asset slot. The image area is display-only — it shows the image, or a
 * clean "사진 없음" placeholder when the path is unset OR the file fails to load
 * (404 → no broken-image icon). Uploading is a SEPARATE explicit button (plus
 * drag-drop onto the image area). Surfaces server collision info / errors.
 */
export function ImageSlot({ slot, imagePath, label, onUploaded }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // A new path (e.g. after upload) should re-attempt to load.
  useEffect(() => {
    setImgError(false);
  }, [imagePath]);

  async function handleFile(file: File): Promise<void> {
    setBusy(true);
    setError(null);
    setInfo(null);
    setImgError(false);
    try {
      const result = await uploadAsset(slot, file);
      if (imagePath && result.relativePath !== imagePath) {
        setInfo(`saved as ${result.relativePath} (기존 파일 보존)`);
      } else {
        setInfo("업로드됨");
      }
      onUploaded();
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
    e.target.value = ""; // allow re-picking the same file
  }

  const filled = imagePath !== "";
  const showImage = filled && !imgError;
  const boxCls = [
    "slot",
    showImage ? "slot--filled" : "slot--empty",
    dragOver ? "slot--drag" : "",
    busy ? "slot--busy" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="slot-wrap">
      <div
        className={boxCls}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        title={label ?? imagePath}
      >
        {showImage ? (
          <img
            className="slot__img"
            src={`/assets/${encodeURI(imagePath)}`}
            alt={label ?? imagePath}
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="slot__placeholder">
            <span className="slot__noimg" aria-hidden="true" />
            <span className="slot__hint">사진 없음</span>
          </div>
        )}
        {label && <div className="slot__label">{label}</div>}
        {busy && <div className="slot__overlay">업로드 중…</div>}
        {info && <div className="slot__overlay slot__overlay--info">{info}</div>}
        {error && (
          <div className="slot__overlay slot__overlay--error">{error}</div>
        )}
      </div>
      <button
        type="button"
        className="slot__upload"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
      >
        {busy ? "업로드 중…" : filled ? "↻ 교체" : "⬆ 업로드"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={onPick}
      />
    </div>
  );
}
