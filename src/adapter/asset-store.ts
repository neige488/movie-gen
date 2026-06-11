/**
 * AssetStore — the only writer/reader of `assets/`.
 *
 * Per ADR 0001, image/video binaries live under `assets/` (gitignored). YAML
 * metadata stores only the *relative path* (no `assets/` prefix), matching the
 * existing fixture style:
 *
 *   characters/{name}/headshot.png
 *   characters/{name}/{look}/face-{0..4}.png
 *   characters/{name}/{look}/body-{0..2}.png
 *   locations/{name}/{refName}.png
 *   props/{name}/{refName}.png
 *   videos/scenes/{sceneSlug}/shots/{shotId}/takes/{takeId}.{ext}
 *
 * Design choices (In-flight decisions, see PR description):
 *  - Slot identification: a discriminated union (`AssetSlot`). The store owns
 *    the path policy — callers cannot construct paths directly. This is the
 *    "deep module" pattern: small interface (`upload`, `resolve`) hides the
 *    full path rule rich implementation.
 *  - Collision policy: append `-2`, `-3`, ... before extension. Never
 *    overwrite. (Web layer surfaces the new filename in the response so the
 *    user knows.)
 *  - Path traversal: every input name is validated (`..`, separators forbid).
 *    `resolve()` re-checks the resolved absolute path stays under `assetsRoot`.
 *  - Extensions:
 *      Image slots — lowercased whitelist (png/jpg/jpeg/gif/webp).
 *                    Unknown => reject. Empty extension => default to `.png`.
 *      Video slots (take-video) — lowercased whitelist (mp4/webm/mov).
 *                    Unknown or missing extension => reject. The whitelist is
 *                    strictly disjoint from the image one so an accidental
 *                    image upload to a take slot fails loudly.
 *
 * The store does NOT update YAML — that is ProjectRepository's job. The web
 * handler calls `assetStore.upload()` then `projectRepository.save*()`.
 */

import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";

export class AssetStoreError extends Error {
  public override readonly name = "AssetStoreError";
}

// ---------------------------------------------------------------------------
// Slot taxonomy — discriminated union, one variant per writable target.
// ---------------------------------------------------------------------------

export type AssetSlot =
  | { kind: "character-headshot"; character: string }
  | {
      kind: "character-face";
      character: string;
      look: string;
      /** 0..4 (5 face profile images per CONTEXT.md) */
      index: number;
    }
  | {
      kind: "character-body";
      character: string;
      look: string;
      /** 0..2 (3 body profile images per CONTEXT.md) */
      index: number;
    }
  | { kind: "location-ref"; location: string; refName: string }
  | { kind: "prop-ref"; prop: string; refName: string }
  | {
      kind: "take-video";
      sceneSlug: string;
      shotId: string;
      takeId: string;
    };

export interface AssetStore {
  /**
   * Write `data` to a slot-derived path. Returns the *relative* path stored
   * in YAML (no `assets/` prefix). Filename collisions resolved by appending
   * `-2`, `-3`, ...
   */
  upload(slot: AssetSlot, originalFilename: string, data: Buffer): Promise<string>;
  /** Resolve a relative path under the assets root to an absolute path. */
  resolve(relativePath: string): string;
  /** Absolute root directory for assets. */
  readonly root: string;
}

const ALLOWED_IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
]);

const ALLOWED_VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov"]);

const FACE_SLOT_COUNT = 5;
const BODY_SLOT_COUNT = 3;

function isVideoSlot(slot: AssetSlot): slot is Extract<
  AssetSlot,
  { kind: "take-video" }
> {
  return slot.kind === "take-video";
}

const SAFE_NAME = /^[a-zA-Z0-9_.-]+$/;

export function createAssetStore(assetsRoot: string): AssetStore {
  const root = path.resolve(assetsRoot);

  function assertSafeSegment(name: string, label: string): void {
    if (!name || name === "." || name === "..") {
      throw new AssetStoreError(`invalid ${label}: "${name}"`);
    }
    if (!SAFE_NAME.test(name)) {
      throw new AssetStoreError(
        `${label} contains illegal characters: "${name}" — only [a-zA-Z0-9_.-] allowed`,
      );
    }
    if (name.includes("..") || name.includes("/") || name.includes("\\")) {
      throw new AssetStoreError(`${label} cannot traverse: "${name}"`);
    }
  }

  function normalizeImageExtension(originalFilename: string): string {
    const dot = originalFilename.lastIndexOf(".");
    if (dot === -1 || dot === originalFilename.length - 1) {
      // No extension — default to png for image slots.
      return "png";
    }
    const ext = originalFilename.slice(dot + 1).toLowerCase();
    if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
      throw new AssetStoreError(
        `unsupported extension ".${ext}" — allowed: ${[...ALLOWED_IMAGE_EXTENSIONS].join(", ")}`,
      );
    }
    return ext;
  }

  function normalizeVideoExtension(originalFilename: string): string {
    const dot = originalFilename.lastIndexOf(".");
    if (dot === -1 || dot === originalFilename.length - 1) {
      // For video slots we require an explicit, known extension — there is no
      // sensible default, and silently choosing one would hide bugs.
      throw new AssetStoreError(
        `take video requires an extension; allowed: ${[...ALLOWED_VIDEO_EXTENSIONS].join(", ")}`,
      );
    }
    const ext = originalFilename.slice(dot + 1).toLowerCase();
    if (!ALLOWED_VIDEO_EXTENSIONS.has(ext)) {
      throw new AssetStoreError(
        `unsupported video extension ".${ext}" — allowed: ${[...ALLOWED_VIDEO_EXTENSIONS].join(", ")}`,
      );
    }
    return ext;
  }

  function slotToTarget(
    slot: AssetSlot,
    ext: string,
  ): { dir: string; basename: string } {
    switch (slot.kind) {
      case "character-headshot": {
        assertSafeSegment(slot.character, "character name");
        return {
          dir: path.join("characters", slot.character),
          basename: `headshot.${ext}`,
        };
      }
      case "character-face": {
        assertSafeSegment(slot.character, "character name");
        assertSafeSegment(slot.look, "look name");
        if (
          !Number.isInteger(slot.index) ||
          slot.index < 0 ||
          slot.index >= FACE_SLOT_COUNT
        ) {
          throw new AssetStoreError(
            `face slot index must be 0..${FACE_SLOT_COUNT - 1} (got ${slot.index})`,
          );
        }
        return {
          dir: path.join("characters", slot.character, slot.look),
          basename: `face-${slot.index}.${ext}`,
        };
      }
      case "character-body": {
        assertSafeSegment(slot.character, "character name");
        assertSafeSegment(slot.look, "look name");
        if (
          !Number.isInteger(slot.index) ||
          slot.index < 0 ||
          slot.index >= BODY_SLOT_COUNT
        ) {
          throw new AssetStoreError(
            `body slot index must be 0..${BODY_SLOT_COUNT - 1} (got ${slot.index})`,
          );
        }
        return {
          dir: path.join("characters", slot.character, slot.look),
          basename: `body-${slot.index}.${ext}`,
        };
      }
      case "location-ref": {
        assertSafeSegment(slot.location, "location name");
        assertSafeSegment(slot.refName, "reference name");
        return {
          dir: path.join("locations", slot.location),
          basename: `${slot.refName}.${ext}`,
        };
      }
      case "prop-ref": {
        assertSafeSegment(slot.prop, "prop name");
        assertSafeSegment(slot.refName, "reference name");
        return {
          dir: path.join("props", slot.prop),
          basename: `${slot.refName}.${ext}`,
        };
      }
      case "take-video": {
        assertSafeSegment(slot.sceneSlug, "scene slug");
        assertSafeSegment(slot.shotId, "shot id");
        assertSafeSegment(slot.takeId, "take id");
        return {
          dir: path.join(
            "videos",
            "scenes",
            slot.sceneSlug,
            "shots",
            slot.shotId,
            "takes",
          ),
          basename: `${slot.takeId}.${ext}`,
        };
      }
      default: {
        const exhaustive: never = slot;
        throw new AssetStoreError(
          `unknown slot kind: ${JSON.stringify(exhaustive)}`,
        );
      }
    }
  }

  async function exists(absPath: string): Promise<boolean> {
    try {
      await access(absPath);
      return true;
    } catch {
      return false;
    }
  }

  async function pickAvailable(
    relDir: string,
    basename: string,
  ): Promise<string> {
    const absDir = path.join(root, relDir);
    const dot = basename.lastIndexOf(".");
    const stem = dot === -1 ? basename : basename.slice(0, dot);
    const ext = dot === -1 ? "" : basename.slice(dot);
    let candidate = basename;
    let n = 2;
    while (await exists(path.join(absDir, candidate))) {
      candidate = `${stem}-${n}${ext}`;
      n++;
      if (n > 10000) {
        throw new AssetStoreError(
          `too many collisions for ${relDir}/${basename}`,
        );
      }
    }
    return candidate;
  }

  return {
    root,

    async upload(slot, originalFilename, data) {
      const ext = isVideoSlot(slot)
        ? normalizeVideoExtension(originalFilename)
        : normalizeImageExtension(originalFilename);
      const { dir, basename } = slotToTarget(slot, ext);
      const absDir = path.join(root, dir);
      await mkdir(absDir, { recursive: true });
      const chosen = await pickAvailable(dir, basename);
      const absFile = path.join(absDir, chosen);
      // Final containment check — defense in depth.
      const resolvedAbs = path.resolve(absFile);
      if (!resolvedAbs.startsWith(root + path.sep) && resolvedAbs !== root) {
        throw new AssetStoreError(
          `refusing to write outside assets root: ${resolvedAbs}`,
        );
      }
      await writeFile(absFile, data);
      // Always use POSIX separators in the stored relative path — yaml and
      // browser URLs both use `/`.
      return path.posix.join(...dir.split(path.sep), chosen);
    },

    resolve(relativePath) {
      if (path.isAbsolute(relativePath)) {
        throw new AssetStoreError(
          `absolute paths not allowed: ${relativePath}`,
        );
      }
      if (relativePath.includes("..")) {
        throw new AssetStoreError(
          `path traversal not allowed: ${relativePath}`,
        );
      }
      const abs = path.resolve(root, relativePath);
      if (!abs.startsWith(root + path.sep) && abs !== root) {
        throw new AssetStoreError(
          `resolved path escapes assets root: ${abs}`,
        );
      }
      return abs;
    },
  };
}
