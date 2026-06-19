# 캐릭터 레퍼런스 이미지 생성 프롬프트

> **이 문서는 SSOT가 아니다.** 헤드샷·룩 시트 생성 프롬프트는 이제 각 캐릭터 YAML의
> ImageRef `prompt` 필드가 SSOT다(`headshot.prompt`, `looks[].uniform.prompt`).
> prompt-preset 체계 도입(PR #37) + headshot/uniform ImageRef 전환(PR #39)으로,
> 과거 이 문서에 영문으로 두던 묘사는 전부 한글로 각 YAML에 이전됐다.

## 작성 규약

- **headshot.prompt**: 캐릭터 얼굴 ID(의상·헤어 무관, 영화 전체 공통). 캐릭터 외모 묘사 +
  공통 꼬리(정면 클로즈업, 중립 표정, 어깨선까지, 단색 배경, 균일 조명, 글씨·워터마크 없음).
- **looks[].uniform.prompt**: 그 룩의 의상 소스 시트(앞뒤 2분할). 공통 머리말(2분할 시트 ·
  중립 A-포즈 · 단색 밝은 회색 배경 · 스튜디오 조명 · 소품·글씨 없음) + `의상:` 구체 묘사.
  여기서 디렉터가 face(5분할)/body(3분할)를 파생한다.
- 전 캐릭터 공통 톤: photorealistic, cinematic portrait.
- `@이름`(refName)은 face/body에만 부여(엔진 멘션 대상). headshot은 얼굴 ID용 refName,
  uniform은 소스라 refName 없이 prompt만.

새 캐릭터·룩을 추가할 때는 위 규약대로 해당 YAML의 `prompt` 필드를 직접 채운다.
작성 워크플로 전반은 스킬 `shot-prompt-authoring` 참조.
