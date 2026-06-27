---
name: shot-prompt-authoring
description: >-
  movie-gen 프로젝트에서 씨댄스/Runway 영상 생성용 Shot 프롬프트를 작성·편집할 때 따르는 규칙.
  공통 prefix/suffix 조립, @이름 레퍼런스 인라인 + 라이브러리 네이밍 규칙, 15초 단위 Shot
  분리·chaining, 샷별 명시 포맷(사이즈·카메라무브·블로킹·연기), 화면비 처리, 한글 작성 규칙을
  다룬다. Shot.prompt를 새로 쓰거나 고칠 때, ref(@이름)를 등록·참조할 때, 영화 룩(prefix/suffix
  프리셋)을 정할 때 사용. "Shot 프롬프트", "영상 프롬프트", "프롬프트 작성", "ref 등록", "씬 프롬프트"
  같은 작업에 트리거.
---

# Shot 프롬프트 작성 규칙 (movie-gen)

영상 생성 엔진에 넣는 프롬프트를 일관된 포맷으로 작성하기 위한 규칙. 이 도구는 영상을
생성하지 않고 **프롬프트를 관리**한다 — 디렉터가 최종 프롬프트를 엔진(씨댄스/Runway)에 직접
붙여넣는다.

## 최종 프롬프트 구조

```
[prefix]  ← 영화 단위 공통 (카메라 종류/화질 룩). 보통 영어. 모든 Shot 공통.
[본문]    ← 이 Shot 고유. @이름 인라인 + 아래 "샷별 명시 포맷". 한글.
[suffix]  ← 영화 단위 공통 네거티브(무엇을 만들지 말 것). 한글.
```

**중요:** `prefix`·`suffix`는 도구가 자동으로 감싼다. **Shot.prompt(디스크)에는 "본문"만 저장**한다 —
prefix/suffix를 본문에 직접 쓰지 말 것(중복됨).

- prefix/suffix의 **실제 값은 `data/prompt-preset.yaml`이 SSOT**다. 작성 전 이 파일을 읽어 현재
  영화의 룩·네거티브를 확인할 것.
- 파일이 없거나 prefix를 새로 정해야 하면 → `references/camera-looks.md`에서 룩을 골라 제안.
- 네거티브 suffix 기준선(예): `배경 음악 없음. 자막 없음. 글씨 없음. 내레이션 없음. 오로지
  대사와 효과음. 얼굴에 추가 점 없음. 화면에 동일 인물 없음. 복장 유지.`

## 레퍼런스(@이름) 규칙

엔진의 레퍼런스는 **계정 전역**으로 이름 등록되고, 프롬프트 본문에서 `@이름`으로 **직접 인라인**
지칭한다. 첨부+텍스트 설명 방식이 아니라 `@이름`을 문장에 그대로 넣는다.

- **네이밍:** `{프로젝트}_{종류}_{고유이름}` · 구분자는 **`_`만**(하이픈·공백 불가).
  - 종류: `c`(character) / `l`(location) / `p`(prop).
  - 예: `@p1_c_suah_face`, `@p1_c_suah_full`, `@p1_c_jihoon_face`, `@p1_l_rooftop_cafe`.
  - 캐릭터는 보통 **face + full(body)** 2개를 등록 → 클로즈업엔 `_face`, 전신/와이드엔 `_full`.
- 프로젝트 prefix(`p1` 등)는 영화 단위 상수다. 새 ref 이름은 라이브러리의 기존 등록명을 따르고,
  없으면 위 규칙으로 새로 짓되 **전역 충돌이 안 나게** 프로젝트 prefix를 반드시 붙인다.
- 본문에 쓰는 `@이름`은 **라이브러리에 등록된 `refName`과 정확히 일치**해야 한다(불일치 시 부팅 에러).

### 라이브러리 에셋 생성/등록 시 — `refName` 부여

`@이름`의 SSOT는 **라이브러리**다. 각 레퍼런스 이미지는 ImageRef `{ image, refName?, ... }`이고,
`refName`이 그 엔진 `@이름`이다. 라이브러리 에셋을 만들거나 ref 이미지를 등록할 때:

- **Look**: `face.refName` / `body.refName`에 부여 (`p1_c_suah_face` / `p1_c_suah_full`).
- **Location/Prop**: `references[].refName`에 부여 (`p1_l_rooftop_cafe`).
- 이 `refName`을 그대로 엔진(Runway 등)에도 같은 이름으로 등록한다 — 둘이 일치해야 `@`가 resolve.
- 코드는 `refName` **포맷(`[a-z0-9_]+`)·프로젝트 내 유일성**만 검증한다. 작명은 LLM이 규약대로.
- 유효 `@이름` 레지스트리는 라이브러리의 모든 `refName`에서 자동 도출된다(프리셋에 목록을 두지 않음).

**에셋 이미지 생성 프롬프트:** 각 ImageRef는 생성 `prompt`를 가질 수 있고, 모든 종류에 기본 프롬프트가
있다(도메인 `DEFAULT_HEADSHOT_PROMPT` / `DEFAULT_FACE_PROMPT` / `DEFAULT_BODY_PROMPT` /
`DEFAULT_UNIFORM_PROMPT` / `DEFAULT_SHEET_PROMPT`). face/body/uniform/sheet는 모두 **headshot + 그
Look의 의상(uniform)을 입력으로** 생성하는 흐름.
- **headshot**(Character 단위 얼굴 ID): 정면 클로즈업 식별용. `headshot.prompt`.
- **face**(Look 단위): **얼굴 시트** — 왼쪽 정면 클로즈업 헤드샷 + 오른쪽 4분할(3/4 좌·우, 측면, 아래서). `Look.face`(image + prompt).
- **body**(Look 단위): **3분할 전신 시트**(정면·측면·후면). `Look.body`(image + prompt).
- **uniform**(Look 단위, 선택): **2분할 앞/뒤** 의상 소스 한 장. `Look.uniform`(image + prompt).
  `@refName`은 보통 video에 쓰는 face/body에 달고, uniform은 소스로만 둔다.
- **sheet**(Look 단위, 선택): **가로 3분할 통합 시트** 한 장(왼쪽 전신 앞/뒤 · 중앙 클로즈 헤드샷 ·
  오른쪽 얼굴 4각도). `Look.sheet`(image + prompt). face/body를 대체하지 않는 추가형 ref.

## Shot 단위 = 1회 생성(≤15초)

- **15초 이내**면 **한 Shot**으로 작성한다 — 여러 Shot으로 쪼개지 말 것. 컷이 여러 개여도
  **한 프롬프트 안에서** `[초]` 비트로 묘사한다.
- **15초를 초과**할 때만 Shot을 나누고 **chaining**한다 — 다음 Shot은 직전 Shot의 starred Take를
  ref로 이어받는다(`prevShotRef`). Scene 경계는 넘지 않는다.

## 샷별 명시 포맷

카메라 **종류(룩)는 prefix에서 상속**하므로 본문에 반복하지 않는다. 본문에서 샷마다 명시하는 것:

```
[샷 사이즈/앵글] · [카메라 무브] · [블로킹(@refs로 누가 무엇을)] · [연기/감정]
```

멀티컷이면 컷마다 `[초]` 비트 줄로 위 포맷을 반복한다.

### 예시 (한 Shot, 15초, 5컷)

```
[0–3초] 와이드 설정샷 · 카메라: 핸드헬드 팔로우 후 우측 패닝 · @p1_c_jihoon_full 이 빈 테이블 사이를 가로질러 오고 @p1_c_suah_full 이 일어선다 · 연기: 지훈 굳은 표정·긴장한 보폭, 수아 망설이다 천천히 기립
[3–6초] 클로즈업 · 카메라: 고정, 미세 드리프트 · @p1_c_suah_face · 연기: 반가움과 경계심 교차, 떨리는 눈동자
[6–9초] 리버스 클로즈업 · 카메라: 핸드헬드 · @p1_c_jihoon_face · 연기: 입을 열려다 삼키고 시선을 떨궜다 다시 든다
[9–12초] 미디엄 투샷 · 카메라: 좌→우 아크 무빙 · @p1_c_suah_full 과 @p1_c_jihoon_full 마주 섬 · 연기: 동시에 한 걸음 다가서려다 멈칫
[12–15초] 인서트→틸트업 · 카메라: 손에서 얼굴로 틸트 · 식은 커피잔 → @p1_c_suah_face · 연기: 옅은 미소, 안도
```

위 본문에 도구가 prefix/suffix를 감싸 최종 프롬프트가 된다.

## 화면비 (Aspect ratio)

화면비는 **프롬프트 토큰이 아니라 엔진의 출력 포맷 설정**으로 정한다. 영화 전체가 하나로
통일돼야 하는 상수다(샷마다 바꾸지 말 것). 프롬프트 본문에 `2.39:1` 같은 비율 토큰을 **넣지 말
것** — 16:9 출력에 가짜 레터박스 바가 베이킹될 수 있다. 아나모픽 "룩"(가로 플레어·타원형 보케)은
prefix의 렌즈 용어로 표현하고, 와이드 "프레임"은 출력 포맷으로 설정한다.

## 언어

본문(상황·블로킹·연기)과 ref 식별자는 **한글**. prefix(카메라/화질 룩)와 suffix(네거티브)는 엔진이
더 잘 따르는 쪽으로 — prefix는 보통 영어(장비 고유명사), suffix 네거티브는 한글이 잘 먹는다.

## 작성 워크플로

1. `data/prompt-preset.yaml`을 읽어 현재 영화의 prefix(룩)·suffix(네거티브)를 확인. prefix를 새로
   정해야 하면 `references/camera-looks.md`에서 골라 제안.
2. 각 Shot이 **≤15초**인지 확인 → 한 Shot. 초과 시에만 분리 + chaining.
3. 본문을 **샷별 명시 포맷**으로 작성, ref는 라이브러리 등록명 `@이름`으로 인라인.
4. **Shot.prompt에는 본문만** 저장(prefix/suffix 제외 — 도구가 조립).
5. 화면비 토큰은 본문에 넣지 않는다.

## 더 읽을 것

- **카메라 룩 라이브러리(prefix 후보)**: `references/camera-looks.md` — 렌즈/필름스톡/무브/그레이드
  빌딩블록 + 바로 쓰는 룩 조합. 영화의 prefix를 정하거나 톤을 바꿀 때 읽는다.
- 도메인 정의(Shot·Take·Scene·chaining·prompt-preset): 프로젝트 루트 `CONTEXT.md`.
