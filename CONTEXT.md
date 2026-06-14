# Movie Gen

영화 제작 산출물 관리 웹 프로젝트. 각본·영상 프롬프트·캐릭터/로케이션/소품 레퍼런스를 한눈에 보고 관리하는 도구. 1 인스턴스 = 1 영화.

## Locked decisions

- **Authoring: hybrid two-tool.** 웹 앱은 **모든 산출물을 수정 가능한 풀-에디터** (read + edit + upload). 그러나 운영 원칙상 본격적·구조적 작성(새 Scene 구조, 새 Shot 정렬, Shot prompt 본격 작성 등 깊은 컨텍스트 필요)은 Claude Code(외부 LLM)에서 진행하고, 가벼운 수정·복사·starred 토글·에셋 업로드는 웹에서 한다. 두 도구가 같은 파일을 공유 (file watcher/새로고침으로 sync).
  - _Why:_ 영화 컨셉노트·시나리오 아웃라인·과거 결정의 뉘앙스를 컨텍스트로 들고 작성해야 하므로 깊은 작업은 외부 LLM이 자연스러움. 단, 디렉터가 흐름을 끊지 않고 가벼운 수정·관리할 수 있어야 하므로 웹도 풀 편집 기능을 가진다.

- **Git tracked vs local-only.**
  - **Git tracked:** 각본, Shot prompt, Character/Location/Prop의 생성 프롬프트, 에셋 메타데이터(파일명·경로·설명·링크 관계).
  - **Local only (`.gitignore`):** 실제 이미지/영상 바이너리. 산출물의 "포인터"만 git에 남고, 실물은 로컬에 둔다.

- **Video generation engine: 씨댄스 2.0.**
  - Shot 1회 생성 최대 15초. duration은 **4-15초** 사이로 매 Shot마다 지정.
  - Scene 길이가 15초를 넘으면 직전 Shot의 starred Take를 ref로 받아 **chaining** (Scene 경계는 넘지 않음).

- **Storage: file-based (YAML + Markdown).** 산출물은 파일로 저장한다. DB 미사용. 메타데이터 = YAML, 각본 본문 = Markdown. `data/`(git tracked) + `assets/`(local-only, `.gitignore`). 미래 DB 이행은 필요 시점에 import 스크립트로. 자세한 사유는 [ADR 0001](docs/adr/0001-file-based-storage.md).
  - Scene = 폴더(`data/scenes/{slug}/`). 그 안에 `scene.yaml`, `screenplay.md`, `shots.yaml`.
  - **Scene 순서 + 막 구조 = `data/movie.yaml`** (`acts:` → 3 막별 slug 리스트). 도메인 폴더 밖, `data/` 루트에 둔다.
  - Character/Location/Prop = 도메인별 폴더, 객체당 단일 YAML 파일.
  - 메타데이터에는 상대 파일명만 박음 (절대경로 금지 → 머신 이식성 보존).

- **Branch policy.** `main` = 도구(Movie Gen) 개발 브랜치 — 코드 + `CONTEXT.md`/`docs/adr`/`docs/specs` 같은 도구 docs. 영화별 작업은 별도 브랜치(예: `ptsd`, `the-beach`)에서 진행하고 `data/`와 영화별 docs를 거기에 둔다. 도구 업데이트는 main에서 영화 브랜치로 merge.
  - _Why:_ 도구 발전과 영화 컨텐츠 발전이 다른 사이클·다른 리뷰 단위. main을 영화에서 독립적으로 유지해야 다음 영화에도 도구를 깨끗이 재사용할 수 있음.
  - **docs 소유권 규칙:** 영화별 docs(`concept.md`, `scenario-outline.md`, `handover.md` 등)는 영화 브랜치의 `docs/project/`에 둔다. main은 `docs/project/`를 절대 만들지 않고, 영화 브랜치는 도구 docs(`docs/adr`/`docs/specs`)를 수정하지 않는다 → main→영화 브랜치 merge가 구조적으로 충돌 없음.

- **Scene model: flat folders + `isStarred` boolean.** Scene 사이의 "분기/대안 버전"은 별도 도메인 모델로 격상하지 않는다. 그냥 새 Scene 폴더를 추가한다(예: 웹의 "Scene 복사" 기능). 각 Scene이 `isStarred: true/false`로 메인 영화 시퀀스 포함 여부를 표시. **영화 시퀀스 = Scene 순서 매니페스트에서 `isStarred: true`인 Scene만 필터** (순서 SSOT는 아래 "Scene ordering" 결정 참조). 이전 Scene의 Shot/Take 자산은 보존된다.

- **Scene ordering & act 구조: 중앙 매니페스트 (`data/movie.yaml`).** Scene 순서 + 막(Act) 배치의 단일 출처는 `data/movie.yaml`의 `acts:` 구조 — 3개 막(`id: 1|2|3`)이 각각 순서 있는 Scene slug 리스트를 가진다. **모든** Scene(starred + non-starred)이 정확히 한 막에 속한다. **선형 영화 순서 = act1 ++ act2 ++ act3 flatten 후 `isStarred=true` 필터.** 막은 BS2상 순차적·연속적이므로 한 막의 모든 Scene이 다음 막보다 앞선다(순서≠막 불일치가 구조적으로 불가). 폴더명 prefix(`s01-`)는 **더 이상 순서를 결정하지 않으며** 사람이 읽는 안정적 slug일 뿐. 순서/막 변경 = 이 파일 재작성(atomic). **진입점 둘:** 기존 Scenes 뷰의 전후 이동, BS2 캔버스의 드래그(막 row 간 이동 = 막 재배치, 막 안 이동 = 순서). 둘 다 같은 매니페스트를 건드린다. non-starred Scene(복사본·대안)도 매니페스트에 자리를 가지므로 starred 토글 시 그 자리에 슬롯인. **초기 마이그레이션:** 매니페스트가 없으면 기존 모든 Scene을 1막에 넣고 생성, 디렉터가 재분배.
  - _Why:_ 순서·막은 개별 Scene의 내재 속성이 아니라 Movie 배열의 전역 관계 → 한 파일에 모으면 도메인('Movie는 3 Act, 각 Act는 Scene 리스트')과 1:1, 재정렬이 폴더 rename/N개 `scene.yaml` 재작성 없이 atomic, 막=연속구간 불변식이 표현 자체로 보장됨. 폴더 rename은 slug 참조를 깨므로 회피.

- **BS2 canvas: 파생 시각화 뷰 (저장 아님).** 캔버스는 3개 막 row로 나뉘고, 각 row는 그 막의 페이지 범위를 0–100%로 정규화한 **타임라인**이다. 비트는 두 종류로, 각자 페이지 위치에 배치된다: **span 비트**(페이지 *범위* = 관객 체류 시간; 설정·토론·재미와 놀이·악당이 다가오다·영혼의 어두운 밤·피날레)는 비례 폭 막대로, **point 비트**(단일 페이지 *순간/전환*; 오프닝·주제 명시·기폭제·2막 진입·B스토리 시작·중간점·절망·3막 진입·마지막 이미지)는 폭 0의 마커(핀)로, **이름을 핀 위 2단 stagger 라벨로 표시**(좁은 막에서 인접 포인트 충돌 방지). 비트에 hover하면 풀 네임 + 페이지 + 한 줄 설명이 툴팁으로 뜬다. **막 row의 폭은 그 막의 페이지 길이 비율**(1막 ≈22% / 2막 ≈55% / 3막 ≈23%)로 그려 막 길이 차이를 시각화한다. Scene은 막 안에서 **균등/인덱스 폭** 블록으로 배치(분량 무시 — 디렉터 선택). **비트 소속은 저장하지 않는다** — 막 안 위치에서 눈으로 가늠하는 가이드일 뿐(Scene↔Beat 할당 개념 없음). 막 배치만 디렉터가 수동 결정. 캔버스 드래그 = 매니페스트 재작성.
  - **비트 구성(15개, Blake 110p 기준 고정·비편집):** 1막 row[1–25p] = 1.오프닝 이미지 … 5.토론 / 2막 row[25–85p] = 6.2막 진입 … 12.영혼의 어두운 밤 / 3막 row[85–110p] = 13.3막 진입 … 15.마지막 이미지. point/span 구분·위치·막 폭 비율은 페이지 주석에서 파생. B스토리는 *진입점*(point)이라 "B스토리 시작"으로 라벨 — 스토리라인 자체는 2막 내내 A스토리와 병렬(비트 시트엔 도입 순간만 표기).
  - **분량 X-ray는 범위 밖(향후):** 실제 Shot duration 합으로 씬 폭을 그리는 '분량 배분 진단'은 의도적으로 MVP에서 제외. 현재는 개수 기준 균등 배치.

- **Screenplay ↔ Shot mapping: HTML comment markers.** `screenplay.md` 본문 안에 `<!-- shot:NN -->` ... `<!-- /shot:NN -->` block으로 각 Shot이 각본의 어느 영역에 매핑되는지 표시. 마커는 Markdown 렌더링 시 안 보이며, 각본 수정 시 본문과 함께 따라간다.

- **Sync via hash, not auto-decision.** 각본 수정 시 Shot·Take의 `screenplay_hash`(마커 블록 안 normalized text의 SHA-256)와 현재 각본을 비교해 **stale 시그널을 표시**할 뿐, 도구가 자동으로 결정하지 않는다. 결정(확인됨 / 재생성 / Shot 폐기)은 디렉터.
  - **Take는 immutable.** 한 번 만든 Take를 도구가 자동 삭제·수정하지 않는다.
  - **작은 수정** → hash 갱신("확인됨" 액션). **큰 수정** → 새 Scene 폴더로 분기.

## Language

**Project**:
영화 한 편 분량의 작업 컨테이너. 본 도구의 1 인스턴스는 1 영화를 담는다.
_Avoid_: Movie, Film

**Scene**:
시나리오 단위. 폴더 1개 = Scene 1개. 모든 Scene은 평등 — 분기/대안도 같은 위계.
_Avoid_: Sequence, Variant, Slot

**Scene manifest** (= Movie manifest):
`data/movie.yaml`. `acts:` → 3개 막(`id: 1|2|3`)별 순서 있는 Scene slug 리스트. Scene 순서 + 막 배치의 단일 출처(SSOT). 폴더명 prefix 정렬을 대체. 재정렬·막 이동은 이 파일만 재작성. 선형 순서 = 3 막 flatten.
_Avoid_: Playlist, Index, per-scene `order`/`beat` 필드(채택 안 함)

**Act** (막):
영화의 3대 구조 단위(1막/2막/3막). BS2상 순차적·연속적. Movie 매니페스트의 `acts`로 표현. 각 Scene은 정확히 한 Act에 속한다. 디렉터가 캔버스에서 수동 배치.
_Avoid_: Part, Section

**Beat** (비트):
Blake Snyder Beat Sheet(BS2)의 15개 구조 비트(오프닝 이미지 … 마지막 이미지). 두 종류 — **span**(페이지 범위 = 관객 체류 시간 → 비례 막대)과 **point**(단일 페이지 순간/전환 → 위치 마커). 막 페이지 타임라인 위 위치/폭은 Blake 페이지 주석에서 파생. **캔버스의 시각 눈금자일 뿐 Scene에 저장하지 않는다** (Scene↔Beat 할당 개념 없음).
_Avoid_: Scene에 `beat` 필드 두기

**BS2 canvas** (비트 시트 캔버스):
3개 막 row + 비트 가이드 위에 Scene을 배치·재정렬하는 시각 뷰. 매니페스트의 파생 표현이자 순서/막의 또 다른 편집 진입점(Scenes 뷰와 동일 SSOT).
_Avoid_: Beat sheet(코드 식별자로는 BS2/canvas 사용)

**Slugline**:
Scene 헤더. `INT./EXT. + LOCATION + TIME OF DAY` 형식. 예: `EXT. 횡단보도 - DAY`.

**Screenplay**:
Scene의 본문. 표준 시나리오 형식 텍스트 (action + dialogue + parenthetical). Markdown으로 저장.
_Avoid_: Script

**Screenplay marker**:
Screenplay 본문에 박는 `<!-- shot:NN -->` ... `<!-- /shot:NN -->` HTML comment block. 어느 영역이 어느 Shot에 매핑되는지 표시. Markdown 렌더링 시 안 보임.

**Shot**:
AI 영상 생성 호출 1회 단위. `prompt` + `duration(4-15s)` + ref들(`characterRefs`, `locationRefs`, `propRefs`, `prevShotRef`) + `screenplay_hash`.
_Avoid_: **Cut**(영화 편집 단위와 충돌 — 본 도메인에서 절대 사용 금지), Clip, GenShot

**Take**:
한 Shot을 실제로 생성/업로드한 결과 영상 1개. **Immutable.** 1 Shot → N Takes → 최대 1 starred. 재생성/재시도가 새 Take를 만든다. `screenplay_hash` 스냅샷을 가짐.
_Avoid_: Attempt, Render

**Screenplay hash**:
마커 블록 안 normalized text(앞뒤 공백 trim + 줄바꿈 정규화)의 SHA-256. Shot/Take 양쪽에 박혀 sync 상태를 표시. 도구는 표시만, 결정은 디렉터. 한 Shot ID에 마커 블록이 여러 개 있으면 각 블록의 normalized text를 빈 줄(`\n\n`)로 join한 뒤 한 번에 해시. "확인됨" 액션은 Shot 단일 갱신 또는 Take 단일 갱신 — 도구는 두 hash를 독립 관리.

**isStarred** (on Scene):
이 Scene이 메인 영화 시퀀스에 포함되는지 boolean. 영화 시퀀스 = Scene 매니페스트(`data/movie.yaml`) 순서에서 `isStarred=true`인 Scene만 필터. 순서 자체는 매니페스트가 소유하고, isStarred는 시퀀스/캔버스 포함 여부만 결정.

**isStarred** (on Take):
해당 Shot의 채택된 Take. Shot당 최대 1개. Shot 사이 chaining 시 `prevShotRef`가 이 Take를 가리킨다.

**Character**:
영화 등장 인물. `name` + `headshot` + `looks[]`로 구성. 얼굴 ID(headshot)는 캐릭터 단위로 통일.

**Headshot**:
캐릭터의 얼굴 ID 이미지. **Character 단위**(의상 무관, 영화 전체에서 공통).
_Avoid_: Portrait

**Look**:
캐릭터의 의상/스타일 변종. 한 캐릭터가 영화 중 여러 의상을 입을 수 있으므로 Look 단위로 분기. 의상별 BodyProfile + FaceProfile을 가진다.
_Avoid_: Outfit, Costume, Wardrobe

**BodyProfile**:
신체/의상 ref. **3분할로 이미 나뉜 시트 이미지 1장**(개별 파일 3개가 아님). **Look 단위**. Look에 `bodyImage`(상대 경로)로 저장.

**FaceProfile**:
얼굴 ref. **5분할로 이미 나뉜 시트 이미지 1장**(개별 파일 5개가 아님). **Look 단위**(의상 디테일이 클로즈업에 영향). Look에 `faceImage`(상대 경로)로 저장.

**Location**:
영화 로케이션. `name` + `references[]`(앵글별 N개).

**Prop**:
영화 소품(상징적 아이템). **1급 도메인**. `name` + `references[]`.
_Avoid_: Item, Object

**Reference (image ref)**:
`{ name, prompt, image }` 단위. Location/Prop의 한 앵글. (Character의 headshot/bodyProfile/faceProfile은 별도 구조이므로 Reference 용어 안 씀.)

**Chaining**:
한 Scene 안에서 영상 길이가 15초를 넘어 여러 Shot으로 쪼개질 때, 다음 Shot이 직전 Shot의 starred Take를 ref로 받아 이어지는 메커니즘. Scene 경계는 넘지 않는다.
_Avoid_: Linking, Continuation

## Relationships

- **Project**은 N개의 **Scene**(폴더), N개의 **Character**, N개의 **Location**, N개의 **Prop**을 가진다.
- **Scene**은 1 **Slugline** + 1 **Screenplay** + N개의 **Shot** + `isStarred` boolean을 가진다.
- **Movie**는 정확히 3개의 **Act**(1막/2막/3막)를 가지며, 각 Act는 순서 있는 **Scene** 리스트를 가진다. 각 Scene은 정확히 한 Act에 속한다.
- **영화 시퀀스 = Scene 매니페스트(`data/movie.yaml`의 `acts` flatten) 순서에서 `isStarred=true`인 Scene만 필터.** 매니페스트는 모든 Scene을 3개 막으로 그룹지어 담고, isStarred가 시퀀스/캔버스 포함을 결정(디렉터 책임).
- **Shot**은 1 `prompt` + 1 `duration` + 0..1 `prevShotRef`(같은 Scene 내) + N **Take** + 1 `screenplay_hash`를 가지며, 0..N **Character ref**(`{character, look}`), 0..N **Location** ref, 0..N **Prop** ref를 가진다.
- **Shot**은 **Screenplay marker** 블록 1개 이상과 매핑된다 (한 Shot이 여러 블록 가능).
- **Shot**의 **Take**들 중 최대 1개가 `isStarred=true`.
- **Take**는 immutable. `screenplay_hash` 스냅샷을 가진다.
- **Character**는 1 **Headshot** + N **Look**을 가진다.
- **Look**은 1 **faceImage**(5분할 시트 1장) + 1 **bodyImage**(3분할 시트 1장)을 가진다 — 각각 단일 이미지.
- **Location**은 N **Reference**(앵글별)를 가진다.
- **Prop**은 N **Reference**(앵글별)를 가진다.

## Example dialogue

> **Director:** "S2의 Shot 3에서 주인공의 의상이 'hoodie' Look으로 잡혀 있어?"
> **Tool:** "맞음. Shot 3은 `s02-house/screenplay.md`의 `shot:03` 마커 블록과 매핑됨. 단, `screenplay_hash`가 stale — 어제 각본 본문이 수정됨. 재검토 필요할 수 있음."
> **Director:** "표현만 다듬은 거야. Shot 확인됨으로 표시해."
> **Tool:** "Shot 3의 `screenplay_hash` 갱신. 기존 Take들은 그대로 유지."
> **Director:** "S5는 분위기를 다르게 가보고 싶어. 복사해서 darker 버전 만들어줘."
> **Tool:** "`s05-confrontation`을 `s05-confrontation-darker`로 복사. 새 폴더의 `isStarred`는 false (기존 starred 유지)."
