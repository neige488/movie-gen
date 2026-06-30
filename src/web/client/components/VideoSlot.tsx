import { useEffect, useRef, useState } from "react";
import type { AssetSlotSpec } from "../upload-client.js";
import { uploadAsset } from "../upload-client.js";

interface Props {
  slot: AssetSlotSpec;
  /** Relative path under assets root. Empty string ⇒ unset slot. */
  videoPath: string;
  label?: string;
  onUploaded: () => void;
}

/**
 * One VIDEO asset slot. Mirrors ImageSlot but plays a `<video>` (native
 * controls) and accepts video files. The area is display-only — it shows the
 * clip, or a clean "영상 없음" placeholder when unset. Uploading is a separate
 * explicit button (plus drag-drop onto the player area).
 */
export function VideoSlot({ slot, videoPath, label, onUploaded }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-dismiss the transient success toast.
  useEffect(() => {
    if (!info) return;
    const t = setTimeout(() => setInfo(null), 2500);
    return () => clearTimeout(t);
  }, [info]);

  async function handleFile(file: File): Promise<void> {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const result = await uploadAsset(slot, file);
      if (videoPath && result.relativePath !== videoPath) {
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

  const filled = videoPath !== "";
  const boxCls = [
    "slot",
    filled ? "slot--filled" : "slot--empty",
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
        title={label ?? videoPath}
      >
        {filled ? (
          <video
            className="slot__video"
            src={`/assets/${encodeURI(videoPath)}`}
            controls
            preload="metadata"
          />
        ) : (
          <div className="slot__placeholder">
            <span className="slot__noimg" aria-hidden="true" />
            <span className="slot__hint">영상 없음</span>
          </div>
        )}
        {label && <div className="slot__label">{label}</div>}
        {busy && <div className="slot__overlay">업로드 중…</div>}
        {info && <div className="slot__toast slot__toast--info">{info}</div>}
        {error && <div className="slot__toast slot__toast--error">{error}</div>}
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
        accept="video/*"
        style={{ display: "none" }}
        onChange={onPick}
      />
    </div>
  );
}
