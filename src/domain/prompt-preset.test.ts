import { describe, expect, it } from "vitest";
import { createShot } from "./movie.js";
import {
  assembleFinalPrompt,
  createPromptPreset,
  extractRefMentions,
  findUnregisteredMentions,
} from "./prompt-preset.js";

const shotBase = {
  id: "01",
  prompt: "책상에 앉은 인물의 클로즈업",
  duration: 6,
  screenplayHash: "h",
} as const;

describe("createPromptPreset", () => {
  it("defaults missing fields to empty affixes and no registered refs", () => {
    const preset = createPromptPreset({});
    expect(preset.prefix).toBe("");
    expect(preset.suffix).toBe("");
    expect(preset.registeredRefs).toEqual([]);
  });

  it("keeps supplied values", () => {
    const preset = createPromptPreset({
      prefix: "cinematic 4K",
      suffix: "워터마크 없음",
      registeredRefs: ["p1_c_suah_face"],
    });
    expect(preset.prefix).toBe("cinematic 4K");
    expect(preset.suffix).toBe("워터마크 없음");
    expect(preset.registeredRefs).toEqual(["p1_c_suah_face"]);
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
  it("returns [] when the preset has no registered refs (validation off)", () => {
    const preset = createPromptPreset({});
    expect(findUnregisteredMentions(["@p1_c_typo 등장"], preset)).toEqual([]);
  });

  it("flags mentions not in the registered list (sorted, unique)", () => {
    const preset = createPromptPreset({
      registeredRefs: ["p1_c_suah_face", "p1_l_rooftop_cafe"],
    });
    const texts = [
      "@p1_c_suah_face 등장",
      "@p1_c_typo 와 @p1_l_unknown",
      "@p1_c_typo 다시",
    ];
    expect(findUnregisteredMentions(texts, preset)).toEqual([
      "p1_c_typo",
      "p1_l_unknown",
    ]);
  });

  it("passes when every mention is registered", () => {
    const preset = createPromptPreset({
      registeredRefs: ["p1_c_suah_face", "p1_l_rooftop_cafe"],
    });
    expect(
      findUnregisteredMentions(
        ["@p1_c_suah_face 가 @p1_l_rooftop_cafe 에"],
        preset,
      ),
    ).toEqual([]);
  });
});
