import { useRef, useState } from "react";
import type { AssetSlotSpec } from "../upload-client.js";
import { uploadAsset } from "../upload-client.js";

interface Props {
  slot: AssetSlotSpec;
  /** Relative path under assets root. Empty string ⇒ unfilled slot. */
  imagePath: string;
  label?: string;
  onUploaded: () => void;
}

/**
 * One slot: shows the image if present, drop zone if not. Supports both
 * drag-drop and click-to-pick. Surfaces collision info from the server
 * (returned new path when suffix was appended).
 */
export function ImageSlot({ slot, imagePath, label, onUploaded }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File): Promise<void> {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const result = await uploadAsset(slot, file);
      // If the resulting path differs from what we had, the server resolved a
      // collision — surface it briefly so the user knows.
      if (imagePath && result.relativePath !== imagePath) {
        setInfo(`saved as ${result.relativePath} (existing file preserved)`);
      } else {
        setInfo("uploaded");
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
  }

  const filled = imagePath !== "";
  const cls = [
    "slot",
    filled ? "slot--filled" : "slot--empty",
    dragOver ? "slot--drag" : "",
    busy ? "slot--busy" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={cls}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      title={label ?? imagePath}
    >
      {filled ? (
        <img
          className="slot__img"
          src={`/assets/${encodeURI(imagePath)}`}
          alt={label ?? imagePath}
          loading="lazy"
        />
      ) : (
        <div className="slot__placeholder">
          <span className="slot__plus">+</span>
          <span className="slot__hint">drop image</span>
        </div>
      )}
      {label && <div className="slot__label">{label}</div>}
      {busy && <div className="slot__overlay">uploading…</div>}
      {info && <div className="slot__overlay slot__overlay--info">{info}</div>}
      {error && (
        <div className="slot__overlay slot__overlay--error">{error}</div>
      )}
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
