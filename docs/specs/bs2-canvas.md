---
feature: bs2-canvas
milestone: 2
base_branch: main
merge_strategy: per-slice
slices:
  - id: 1
    issue: 19
    title: "Scene 순서 매니페스트 SSOT + Scenes 뷰 재정렬"
    type: feature-e2e
  - id: 2
    issue: 20
    title: "BS2 캔버스 read-view (3막 row + 비트 가이드 + Scene 배치)"
    type: feature-e2e
    blocked_by: [1]
  - id: 3
    issue: 21
    title: "BS2 캔버스 드래그 (막 안 재정렬 + 막 간 이동)"
    type: feature-e2e
    blocked_by: [2]
---

# BS2 Canvas PRD

## Problem Statement

디렉터가 영화의 Scene 순서를 바꾸려면 지금은 폴더명 prefix(`s01-`, `s02-`)에 묶여 있어 폴더를 rename해야 한다 — 무겁고 slug 참조를 깰 위험이 있다. 그래서 "이 장면을 앞으로", "이 둘을 swap" 같은 가벼운 재배치를 자유롭게 시도하기 어렵다.

또한 단편을 BS2(블레이크 스나이더 비트 시트) 구조로 다듬고 싶어도, 지금의 위→아래 한 줄 스크롤 뷰로는 "내 Scene들이 1/2/3막에 어떻게 분포하는지", "어느 비트쯤에 무엇이 몰려 있는지"를 한눈에 볼 수 없다. 영화의 골격(act 구조)을 시각적으로 잡을 도구가 없다.

## Solution

디렉터가 영화의 Scene을 **1막/2막/3막 3개 row로 나눈 캔버스**에서 드래그로 자유롭게 재배치하고, 각 막을 어느 Scene이 채우는지 직접 결정할 수 있게 한다. 각 막 row에는 Blake Snyder Beat Sheet의 비트들이 **비율 가이드(눈금자)**로 깔려, 디렉터는 자기 배치가 BS2 표준 구조와 어떻게 다른지 눈으로 가늠한다.

순서는 더 이상 폴더명에 묶이지 않고 전용 매니페스트가 소유하므로, 폴더 rename 없이 atomic하게 재정렬된다. 같은 순서를 기존 Scenes 뷰에서도 바꿀 수 있어, 캔버스를 열지 않고도 빠르게 재배치할 수 있다. 캔버스는 "이 Scene을 이 비트에 박는" 강제 할당 도구가 아니라, 정렬된 Scene이 어느 비트쯤에 떨어지는지 비추는 시각 진단 뷰다.

## User Stories

1. **디렉터로서**, 영화의 모든(starred) Scene을 1/2/3막 3개 row로 나눠 캔버스에서 보고 싶다, 전체 골격을 한눈에 파악하기 위해.
2. **디렉터로서**, Scene을 드래그해 다른 막 row로 옮기고 싶다, 그 장면이 어느 막에 속하는지 직접 정하기 위해.
3. **디렉터로서**, 한 막 안에서 Scene 순서를 드래그로 바꾸고 싶다, 장면 흐름을 세밀히 조정하기 위해.
4. **디렉터로서**, 각 막 row에 BS2 비트가 비율 가이드(눈금자)로 표시되길 원한다, 내 배치가 비트 구조와 얼마나 맞는지 가늠하기 위해.
5. **디렉터로서**, 비트 가이드의 폭이 Blake가 제시한 페이지 비율대로(비트마다 다르게) 그려지길 원한다, '재미와 놀이'처럼 길어야 할 구간을 시각적으로 인지하기 위해.
6. **디렉터로서**, 1막엔 오프닝 이미지~토론, 2막엔 2막 진입~영혼의 어두운 밤, 3막엔 3막 진입~마지막 이미지 비트가 보이길 원한다, BS2 표준 구조를 참조하기 위해.
7. **디렉터로서**, Scene을 특정 비트에 '집어넣는' 게 아니라 배치된 Scene이 어느 비트쯤에 떨어지는지 읽기만 하고 싶다, 강제 할당 없이 흐름을 진단하기 위해.
8. **디렉터로서**, 캔버스를 열지 않고 기존 Scenes 메뉴에서도 Scene 전후 위치를 바꿀 수 있길 원한다, 빠르게 재정렬하기 위해.
9. **디렉터로서**, 재정렬·막 이동이 즉시 저장되고 새로고침해도 유지되길 원한다, 작업이 날아가지 않게.
10. **디렉터로서**, 영화 시퀀스가 폴더명이 아니라 내가 정한 순서를 따르길 원한다, 폴더를 rename하지 않고 자유롭게 재배치하기 위해.
11. **디렉터로서**, starred가 아닌 대안 Scene도 매니페스트에서 순서상 자리를 유지하길 원한다, 나중에 채택(토글 on)하면 제자리로 들어오게.
12. **디렉터로서**, 캔버스엔 영화에 포함되는(starred) Scene만 보이길 원한다, 최종 영화 구조에 집중하기 위해.
13. **디렉터로서**, 캔버스를 처음 열 때 기존 Scene이 전부 1막에 모여 있어도 괜찮다, 거기서부터 직접 막을 재분배하면 되므로.
14. **디렉터로서**, Scene을 추가·복사·삭제해도 순서 매니페스트가 자동으로 정합성을 유지하길 원한다, 누락·댕글링으로 깨지지 않게.
15. **디렉터로서**, 같은 순서 SSOT를 Scenes 뷰와 캔버스가 공유하길 원한다, 두 화면이 항상 일치하게.
16. **디렉터로서**, Scene 블록이 (분량과 무관하게) 균등 폭으로 그려지길 원한다(현 단계), 순서와 막만 단순·빠르게 조정하기 위해.
17. **디렉터로서**, 막은 1→2→3 순서로 연속되게 강제되길 원한다(2막 Scene이 1막 Scene 앞에 끼지 않게), 영화 골격이 뒤죽박죽되지 않게.

## Implementation Decisions

도메인 어휘는 `CONTEXT.md`를 따른다(Act, Beat, Scene manifest, BS2 canvas). 순서·막 SSOT 결정의 사유와 대안은 `docs/adr/0002-scene-ordering-manifest.md`.

### SSOT — Movie manifest (`data/movie.yaml`)

Scene 순서 + 막(Act) 배치의 단일 출처. 폴더명 prefix는 순서 권위를 박탈당하고 안정적 slug로만 쓰인다. 형태(grill에서 결정된 schema):

```yaml
acts:
  - id: 1
    scenes: [s01-prologue]
  - id: 2
    scenes: [s02-confrontation]
  - id: 3
    scenes: [s03-resolution-alt]
```

- **모든** Scene(starred + non-starred)이 정확히 한 막에 속한다.
- **선형 영화 순서 = act1 ++ act2 ++ act3 flatten 후 `isStarred=true` 필터.** isStarred(scene.yaml)는 시퀀스/캔버스 포함 여부만 결정.
- 막은 순차적·연속적이라 "순서≠막" 불일치가 표현 자체로 불가능.
- 재정렬·막 이동 = 이 파일 1개 atomic 재작성.

### 모듈 (Clean Architecture — 기존 패턴 따름)

**Domain (frameworks-free, 테스트 우선):**

- **MovieArrangement** — 영화 배열 aggregate. 3 Act + 각 Act의 순서 있는 Scene slug 리스트.
  - 인터페이스(작음): `moveScene(slug, toActId, toIndex)`, `linearSequence()`, `actOf(slug)`, `scenesInAct(actId)`.
  - 구현(풍부): invariant 강제 — 각 Scene 정확히 1막 소속, 막 id ∈ {1,2,3}, 중복 slug 없음, 막 순차 연속. 잘못된 이동 거부.

- **BeatSheet** — BS2 15비트의 고정 정의(순수 데이터 + 계산).
  - 인터페이스: `beatsForAct(actId) → Beat[]`(각 Beat: 한국어 label, 막 내 비율 폭), `actBoundaries()`.
  - 구현: Blake 110p 기준 페이지 번호 → 비율 도출(고정·비편집). 막 그룹핑(1막 비트 1–5, 2막 6–12, 3막 13–15).

**Adapter:**

- **MovieManifestRepository**(ProjectRepository 확장 또는 신규) — `data/movie.yaml` 로드/저장.
  - 인터페이스: `loadArrangement() → MovieArrangement`, `saveArrangement(arrangement)`.
  - 구현: reconcile(폴더엔 있고 매니페스트에 없는 Scene → 1막 끝 append, 매니페스트엔 있고 폴더 없는 slug → drop), 마이그레이션(매니페스트 부재 시 모든 Scene을 1막으로 생성), atomic write.
  - `project-repository.ts`의 slug `localeCompare` 정렬을 매니페스트 순서로 교체.

**Web layer:**

- **Reorder/act-move 핸들러**(server) — `MovieArrangement.moveScene`를 호출하고 매니페스트를 저장하는 endpoint. 기존 file-watcher/SSE reload 경로 재사용.
- **Scenes 뷰 재정렬 UI**(client, slice 1) — 기존 SceneNavigator/메인 뷰에서 Scene 전후 이동(드래그 또는 up/down). foundation을 dead code가 아니게 하는 consumer.
- **BS2 canvas**(client, slice 2) — 3 act row, BeatSheet 기반 비트 가이드 눈금자, 균등 폭 Scene 블록, 드래그(막 간 이동 = 막 재배치 / 막 안 이동 = 순서). 같은 매니페스트 SSOT.

### 슬라이스 (참고 — to-issues가 확정)

- **Slice 1 (foundation + consumer):** Movie manifest SSOT + MovieArrangement + reconcile/마이그레이션 + Scenes 뷰 재정렬. 폴더 prefix 정렬 제거.
- **Slice 2 (consumer):** BS2 캔버스 — 3 막 row, 비트 가이드, 드래그 재정렬 + 막 재배치.

DAG depth = 2 (slice1 → slice2). foundation은 consumer(Scenes 뷰 재정렬)와 한 슬라이스로 묶임.

## Testing Decisions

### 좋은 테스트의 정의 (CLAUDE.md 디폴트)

- **외부 동작만 검증**, 구현 디테일 결합 X.
- **도메인 모듈은 테스트 우선(TDD):** MovieArrangement, BeatSheet.
- Adapter(MovieManifestRepository)는 임시 `data/` 디렉토리로 integration test.
- 캔버스/Scenes 재정렬 드래그는 핵심 인터랙션에 한해 E2E.

### 테스트할 모듈 / 형태

| 모듈 | 형태 | 핵심 검증 |
|---|---|---|
| MovieArrangement | unit | 막 이동·순서 변경 후 invariant(1막 소속·순차·중복 없음), 선형 순서 flatten, 잘못된 이동 거부 |
| BeatSheet | unit | 15비트 라벨·막 그룹핑·비율 합 = 100%(막별/전체), 페이지번호→비율 결정성 |
| MovieManifestRepository | integration | reconcile(orphan append·dangling drop), 마이그레이션(부재 시 1막 생성), round-trip(load→save→load 동치), atomic write |
| Scenes 재정렬 / 캔버스 드래그 | E2E | 드래그 후 매니페스트 저장·새로고침 유지·두 뷰 일치 |

### Prior art

- 도메인 unit 테스트: `src/domain/movie.test.ts`, `marker-parser.test.ts`, `sync-evaluator.test.ts`.
- 어댑터 integration: `src/adapter/project-repository.test.ts`(임시 `data/` round-trip 패턴 그대로 차용).

## Out of Scope

- **분량 기반 X-ray** — 실제 Shot duration 합으로 Scene 폭을 그려 "어디가 늘어지는지" 진단하는 기능. 현 단계는 균등/인덱스 폭(분량 무시). 효용 확인 시 별도 ADR/PRD.
- **비트 단위 할당** — Scene을 특정 비트에 박아 저장하는 것. 비트는 시각 가이드일 뿐, Scene에 `beat` 필드 없음.
- **목표 러닝타임 입력** — "이 단편은 12분" 같은 절대 시간 목표 대비 진단. 현재는 비율(scale-invariant)만.
- **자동 막/비트 감지** — Scene 내용을 분석해 막을 자동 추론. 막 배치는 디렉터 수동.
- **막 개수 커스터마이징** — 3막 고정. 4막/시퀀스 패러다임 등 다른 구조 미지원.
- **per-scene `order` 필드** — 채택 안 함(ADR 0002 대안 A reject). 순서는 매니페스트 소유.
- **모바일/태블릿 반응형 캔버스** — 데스크탑 우선.
- **단편 7비트 압축 모드** — 가이드북의 "필수 7비트" 변형 뷰는 미지원, 15비트 가이드 고정.

## Further Notes

- 도메인 정의: `CONTEXT.md` (Act, Beat, Scene manifest, BS2 canvas)
- 순서·막 SSOT 결정 사유/대안: `docs/adr/0002-scene-ordering-manifest.md`
- 파일 저장 모델: `docs/adr/0001-file-based-storage.md`
- **Supersedes:** 기존 `docs/specs/movie-gen.md`의 User Story 8 및 "시퀀스 = 폴더명 prefix 정렬" 결정 — 본 PRD가 매니페스트 기반으로 대체.
- 브랜치 정책: 캔버스는 도구 기능이라 `main`. `data/movie.yaml`은 영화별 데이터지만 main엔 시드만, 실제 영화 브랜치는 main 머지 후 자동 마이그레이션으로 자기 매니페스트 생성 → 충돌 없음.
- 향후 후속 ADR 후보: 분량 X-ray(실제 duration 기반 배치/진단) 효용 확인 시.
