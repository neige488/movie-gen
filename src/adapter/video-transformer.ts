/**
 * VideoTransformer — a Port (hexagonal boundary) for deriving processed videos
 * from a source clip. The domain never imports this; the web composition root
 * wires a concrete implementation in.
 *
 * The only operation today is `blackify`: take a voice self-intro clip and emit
 * a "black frame + source audio only" video — for engines that want the voice
 * without any visual interference but only accept a video container.
 *
 * The default implementation shells out to `ffmpeg`. If ffmpeg is not installed
 * the call rejects with a clear, actionable VideoTransformError (rather than a
 * cryptic spawn ENOENT) so the UI can tell the director to install it.
 */

import { spawn } from "node:child_process";

export class VideoTransformError extends Error {
  public override readonly name = "VideoTransformError";
}

export interface VideoTransformer {
  /**
   * Produce a "black frame + source audio" video at `outputPath` from the
   * source clip at `inputPath`. Both are ABSOLUTE filesystem paths. Overwrites
   * `outputPath` if it exists. The output is always H.264/AAC mp4 (the most
   * broadly compatible container) regardless of the source extension.
   */
  blackify(inputPath: string, outputPath: string): Promise<void>;
}

export interface FfmpegOptions {
  /** ffmpeg binary, default `"ffmpeg"` (resolved on PATH). */
  ffmpegPath?: string;
  /** Output frame size, default `"1280x720"`. */
  size?: string;
  /** Output frame rate, default `30`. */
  fps?: number;
}

export function createFfmpegVideoTransformer(
  opts: FfmpegOptions = {},
): VideoTransformer {
  const bin = opts.ffmpegPath ?? "ffmpeg";
  const size = opts.size ?? "1280x720";
  const fps = opts.fps ?? 30;

  return {
    async blackify(inputPath: string, outputPath: string): Promise<void> {
      // -i <src>                : input 0 (we keep only its audio)
      // -f lavfi -i color=black : input 1, a synthesized black video source
      // -map 1:v -map 0:a       : black video + source audio
      // -shortest               : stop when the (shorter) audio ends
      const args = [
        "-y",
        "-i",
        inputPath,
        "-f",
        "lavfi",
        "-i",
        `color=c=black:s=${size}:r=${fps}`,
        "-map",
        "1:v",
        "-map",
        "0:a",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-shortest",
        outputPath,
      ];
      await runFfmpeg(bin, args);
    },
  };
}

function runFfmpeg(bin: string, args: readonly string[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(bin, args as string[], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      // Keep only the tail so a long log doesn't grow unbounded.
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        reject(
          new VideoTransformError(
            `ffmpeg not found (tried "${bin}"). Install it — on macOS: \`brew install ffmpeg\`.`,
          ),
        );
        return;
      }
      reject(new VideoTransformError(`ffmpeg failed to start: ${err.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new VideoTransformError(
          `ffmpeg exited with code ${code}.\n${stderr.trim()}`,
        ),
      );
    });
  });
}
