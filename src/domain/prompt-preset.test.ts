import { describe, expect, it } from "vitest";
import { createShot } from "./movie.js";
import {
  assembleFinalPrompt,
  createPromptPreset,
  extractRefMentions,
  findUnregisteredLooks,
  findUnregisteredMentions,
} from "./prompt-preset.js";

const shotBase = {
  id: "01",
  prompt: "책상에 앉은 인물의 클로즈업",
  duration: 6,
  screenplayHash: "h",
} as const;

describe("createPromptPreset", () => {
  it("defaults missing fields to empty affixes", () => {
    const preset = createPromptPreset({});
    expect(preset.prefix).toBe("");
    expect(preset.suffix).toBe("");
  });

  it("keeps supplied values", () => {
    const preset = createPromptPreset({
      prefix: "cinematic 4K",
      suffix: "워터마크 없음",
    });
    expect(preset.prefix).toBe("cinematic 4K");
    expect(preset.suffix).toBe("워터마크 없음");
  });

  it("defaults looks to an empty map", () => {
    expect(createPromptPreset({}).looks).toEqual({});
  });

  it("keeps the supplied looks map", () => {
    const preset = createPromptPreset({
      looks: { fantasy: "high-key", reality: "16mm cold" },
    });
    expect(preset.looks).toEqual({ fantasy: "high-key", reality: "16mm cold" });
  });
});

describe("assembleFinalPrompt", () => {
  const preset = createPromptPreset({ prefix: "cinematic 4K", suffix: "워터마크 없음" });

  it("wraps the shot prompt with prefix and suffix", () => {
    const shot = createShot({
      ...shotBase,
      prompt: "@p1_c_suah_face 클로즈업, 미소",
    });
    expect(assembleFinalPrompt(shot, preset)).toBe(
      "cinematic 4K\n\n@p1_c_suah_face 클로즈업, 미소\n\n워터마크 없음",
    );
  });

  it("returns just the shot prompt for an empty preset", () => {
    const shot = createShot({ ...shotBase });
    expect(assembleFinalPrompt(shot, createPromptPreset({}))).toBe(
      "책상에 앉은 인물의 클로즈업",
    );
  });

  describe("with looks", () => {
    const lookPreset = createPromptPreset({
      prefix: "base",
      suffix: "neg",
      looks: {
        default: "neutral grade",
        fantasy: "high-key pastel",
        reality: "16mm cold",
      },
    });

    it("inserts the named look package between prefix and body", () => {
      const shot = createShot({ ...shotBase, prompt: "장면" });
      expect(assembleFinalPrompt(shot, lookPreset, "fantasy")).toBe(
        "base\n\nhigh-key pastel\n\n장면\n\nneg",
      );
    });

    it("applies the reserved default look when no look is given", () => {
      const shot = createShot({ ...shotBase, prompt: "장면" });
      expect(assembleFinalPrompt(shot, lookPreset)).toBe(
        "base\n\nneutral grade\n\n장면\n\nneg",
      );
    });

    it("omits the look package when there is no default and no look", () => {
      const noDefault = createPromptPreset({
        prefix: "base",
        looks: { fantasy: "high-key" },
      });
      const shot = createShot({ ...shotBase, prompt: "장면" });
      expect(assembleFinalPrompt(shot, noDefault)).toBe("base\n\n장면");
    });

    it("stays backward compatible — empty looks behaves like prefix→body→suffix", () => {
      const legacy = createPromptPreset({ prefix: "base", suffix: "neg" });
      const shot = createShot({ ...shotBase, prompt: "장면" });
      // Even if a look key is passed, an empty looks map contributes nothing.
      expect(assembleFinalPrompt(shot, legacy, "fantasy")).toBe(
        "base\n\n장면\n\nneg",
      );
    });
  });
});

describe("findUnregisteredLooks", () => {
  it("returns [] when no looks are registered (validation off)", () => {
    expect(findUnregisteredLooks(["fantasy", "reality"], [])).toEqual([]);
  });

  it("flags look keys not defined in the preset (sorted, unique)", () => {
    const registered = ["default", "fantasy", "reality"];
    expect(
      findUnregisteredLooks(
        ["fantasy", "dreem", "reality", "dreem", undefined],
        registered,
      ),
    ).toEqual(["dreem"]);
  });

  it("ignores undefined (scenes/shots with no look)", () => {
    expect(
      findUnregisteredLooks([undefined, undefined], ["fantasy"]),
    ).toEqual([]);
  });

  it("passes when every used look is registered", () => {
    expect(
      findUnregisteredLooks(["fantasy", "reality"], ["fantasy", "reality"]),
    ).toEqual([]);
  });
});

describe("extractRefMentions", () => {
  it("pulls @names (without @), de-duplicated, in first-seen order", () => {
    expect(
      extractRefMentions(
        "@p1_c_suah_face 와 @p1_c_jihoon_full 이 @p1_l_rooftop_cafe 에서. 다시 @p1_c_suah_face.",
      ),
    ).toEqual(["p1_c_suah_face", "p1_c_jihoon_full", "p1_l_rooftop_cafe"]);
  });

  it("returns [] when there are no mentions", () => {
    expect(extractRefMentions("책상에 앉은 인물")).toEqual([]);
  });
});

describe("findUnregisteredMentions", () => {
  it("returns [] when the registry is empty (validation off)", () => {
    expect(findUnregisteredMentions(["@p1_c_typo 등장"], [])).toEqual([]);
  });

  it("flags mentions not in the registry (sorted, unique)", () => {
    const registry = ["p1_c_suah_face", "p1_l_rooftop_cafe"];
    const texts = [
      "@p1_c_suah_face 등장",
      "@p1_c_typo 와 @p1_l_unknown",
      "@p1_c_typo 다시",
    ];
    expect(findUnregisteredMentions(texts, registry)).toEqual([
      "p1_c_typo",
      "p1_l_unknown",
    ]);
  });

  it("passes when every mention is in the registry", () => {
    const registry = ["p1_c_suah_face", "p1_l_rooftop_cafe"];
    expect(
      findUnregisteredMentions(
        ["@p1_c_suah_face 가 @p1_l_rooftop_cafe 에"],
        registry,
      ),
    ).toEqual([]);
  });
});
