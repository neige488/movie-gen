import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  loadPromptPreset,
  PromptPresetError,
} from "./prompt-preset-repository.js";

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "moviegen-preset-test-"));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

function writePreset(text: string): void {
  writeFileSync(path.join(dataDir, "prompt-preset.yaml"), text);
}

describe("loadPromptPreset", () => {
  it("returns the identity preset when the file is absent", async () => {
    const preset = await loadPromptPreset(dataDir);
    expect(preset.prefix).toBe("");
    expect(preset.suffix).toBe("");
    expect(preset.registeredRefs).toEqual([]);
  });

  it("returns the identity preset for an empty file", async () => {
    writePreset("");
    const preset = await loadPromptPreset(dataDir);
    expect(preset.prefix).toBe("");
    expect(preset.registeredRefs).toEqual([]);
  });

  it("loads affixes and the registered ref list", async () => {
    writePreset(
      [
        "prefix: cinematic 4K",
        "suffix: 워터마크 없음",
        "refs:",
        "  - p1_c_suah_face",
        "  - p1_l_rooftop_cafe",
        "",
      ].join("\n"),
    );
    const preset = await loadPromptPreset(dataDir);
    expect(preset.prefix).toBe("cinematic 4K");
    expect(preset.suffix).toBe("워터마크 없음");
    expect(preset.registeredRefs).toEqual([
      "p1_c_suah_face",
      "p1_l_rooftop_cafe",
    ]);
  });

  it("throws a named error when a field has the wrong type", async () => {
    writePreset("prefix: 123\n");
    await expect(loadPromptPreset(dataDir)).rejects.toThrow(PromptPresetError);
    await expect(loadPromptPreset(dataDir)).rejects.toThrow(/prompt-preset\.yaml/);
  });
});
