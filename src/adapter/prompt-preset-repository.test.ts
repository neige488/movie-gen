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
  });

  it("returns the identity preset for an empty file", async () => {
    writePreset("");
    const preset = await loadPromptPreset(dataDir);
    expect(preset.prefix).toBe("");
    expect(preset.suffix).toBe("");
    expect(preset.looks).toEqual({});
  });

  it("loads the looks map", async () => {
    writePreset(
      [
        "prefix: base",
        "looks:",
        "  default: neutral grade",
        "  fantasy: high-key pastel",
        "  reality: 16mm cold",
        "",
      ].join("\n"),
    );
    const preset = await loadPromptPreset(dataDir);
    expect(preset.looks).toEqual({
      default: "neutral grade",
      fantasy: "high-key pastel",
      reality: "16mm cold",
    });
  });

  it("throws a named error when a looks value has the wrong type", async () => {
    writePreset(["looks:", "  fantasy: 123", ""].join("\n"));
    await expect(loadPromptPreset(dataDir)).rejects.toThrow(PromptPresetError);
    await expect(loadPromptPreset(dataDir)).rejects.toThrow(/prompt-preset\.yaml/);
  });

  it("loads the prefix and suffix affixes", async () => {
    writePreset(["prefix: cinematic 4K", "suffix: 워터마크 없음", ""].join("\n"));
    const preset = await loadPromptPreset(dataDir);
    expect(preset.prefix).toBe("cinematic 4K");
    expect(preset.suffix).toBe("워터마크 없음");
  });

  it("throws a named error when a field has the wrong type", async () => {
    writePreset("prefix: 123\n");
    await expect(loadPromptPreset(dataDir)).rejects.toThrow(PromptPresetError);
    await expect(loadPromptPreset(dataDir)).rejects.toThrow(/prompt-preset\.yaml/);
  });
});
