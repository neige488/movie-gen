---
feature: movie-gen
milestone: 1
base_branch: main
merge_strategy: per-slice
slices:
  - id: 1
    issue: 1
    title: "Foundation + Scene Viewer"
    type: feature-e2e
  - id: 2
    issue: 2
    title: "Asset Library + 이미지 업로드"
    type: feature-e2e
    blocked_by: [1]
  - id: 3
    issue: 3
    title: "Take 업로드 + 플레이어"
    type: feature-e2e
    blocked_by: [1]
  - id: 4
    issue: 7
    title: "Starred 토글 (Take + Scene)"
    type: feature-e2e
    blocked_by: [1, 3]
  - id: 5
    issue: 4
    title: "Light edit (Scene 복사 + screenplay + slugline)"
    type: feature-e2e
    blocked_by: [1]
  - id: 6
    issue: 5
    title: "Sync 시그널 + 확인됨 액션"
    type: feature-e2e
    blocked_by: [1]
  - id: 7
    issue: 8
    title: "Shot 메타 편집 + Marker 시각화"
    type: feature-e2e
    blocked_by: [1, 6]
  - id: 8
    issue: 9
    title: "Chaining 자동화"
    type: behavior-change
    blocked_by: [4, 7]
  - id: 9
    issue: 6
    title: "File watcher + 자동 reload"
    type: feature-e2e
    blocked_by: [1]
---

# Movie Gen PRD

## Problem Statement

영화 디렉터가 AI 영상 생성으로 단편영화를 만들 때, 각본·영상 프롬프트·캐릭터/로케이션/소품 ref 이미지·생성된 Take 영상이 사방에 흩어진다. "지금 어디까지 됐는지", "이 영상은 어느 각본 기반인지", "이 캐릭터의 후드티 룩 face ref는 어디 있는지"를 한눈에 파악할 수 없다.

특히 각본을 수정할 때마다 어떤 Shot/Take가 구버전 기반인지 추적할 도구가 없고, 분기 시도(같은 Scene의 대안 버전)를 만들면 이전 자산이 묻혀버린다. 변경 이력도 손실된다.

## Solution

디렉터가 작업 중인 영화 한 편의 산출물 전체(각본·영상 프롬프트·ref 이미지·Take)를 **한 곳에서 한눈에 보고 관리**하는 웹 도구. 깊은 작업(각본·Shot prompt 작성)은 Claude Code에서 진행하면, 같은 파일(`data/`)에 쓰여 웹이 즉시 정렬해 보여준다. 가벼운 수정·복사·starred 토글·에셋 업로드는 웹에서 직접. 모든 메타데이터가 git에 트래킹돼 변경 이력이 자연 보존되고, hash 기반 stale 시그널로 각본 수정의 파급을 즉시 알린다.

## User Stories

1. **디렉터로서**, 영화 전체의 Scene → Shot → Take 진척을 위→아래 한 페이지 스크롤로 훑고 싶다, 어디가 비었는지 파악하기 위해.
2. **디렉터로서**, 한 Scene의 각본 본문과 그 Scene의 Shot prompt들을 같은 화면에 보고 싶다, 각본-프롬프트 정합성을 즉시 확인하기 위해.
3. **디렉터로서**, 어느 Shot이 각본의 어느 영역(마커 블록)을 책임지는지 시각적으로 정렬돼 보였으면 한다, 매핑 누락을 즉시 발견하기 위해.
4. **디렉터로서**, 각본 수정 후 영향 받은 Shot/Take에 stale 배지가 자동으로 뜨길 원한다, 어느 영상이 구버전 기반인지 잊지 않기 위해.
5. **디렉터로서**, 의미가 안 변한 작은 수정은 "Shot 확인됨" 또는 "Take 확인됨" 한 번으로 정리하고 싶다, noise를 빨리 비우기 위해.
6. **디렉터로서**, Scene을 통째 복사해 새 분기를 만들 수 있어야 한다, 큰 폭의 재작성을 시도할 때 이전 버전을 잃지 않기 위해.
7. **디렉터로서**, Scene의 `isStarred`를 토글해 어떤 분기가 최종 영화에 들어갈지 표시하고 싶다, 채택된 분기를 명확히 하기 위해.
8. **디렉터로서**, 영화 시퀀스가 `isStarred=true`인 Scene들의 폴더명 prefix 순서로 자동 정렬돼 보였으면 한다, 별도 시퀀스 파일을 관리하지 않아도 되게.
9. **디렉터로서**, 캐릭터의 의상(Look)별로 BodyProfile·FaceProfile을 따로 관리하고 싶다, 같은 얼굴의 다른 의상을 일관성 있게 다루기 위해.
10. **디렉터로서**, 캐릭터의 headshot(얼굴 ID)을 캐릭터 단위 1장으로 공통 사용하고 싶다, 얼굴은 의상과 무관해야 하므로.
11. **디렉터로서**, Location/Prop에 여러 앵글의 ref 이미지를 묶어두고 싶다, Shot마다 적절한 앵글을 골라 쓰기 위해.
12. **디렉터로서**, 한 Shot에서 등장 Character(+적용 Look)·Location·Prop을 한 번에 지정하고 싶다, ref 묶음이 흩어지지 않게.
13. **디렉터로서**, Shot 1개에 N개의 Take를 업로드하고 1개를 starred로 채택하고 싶다, 여러 시도 중 최선을 골라 다음 Shot의 chaining에 반영하기 위해.
14. **디렉터로서**, Scene 길이가 15초를 넘어 chaining이 필요한 경우 직전 Shot의 starred Take를 다음 Shot의 prevShotRef로 자동 따라가게 하고 싶다, 영상 연결 작업 부담을 줄이기 위해.
15. **디렉터로서**, Take의 starred를 바꾸면 다음 Shot의 chaining ref도 새 starred를 자동으로 가리키길 원한다, 일관성을 사람이 추적하지 않아도 되게.
16. **디렉터로서**, 모든 메타데이터(각본·프롬프트·ref 정의)가 git에 트래킹돼 변경 이력이 남길 원한다, "이 대사 언제 왜 바뀌었지"를 추적하기 위해.
17. **디렉터로서**, 실제 이미지/영상 바이너리는 로컬에 두고 git에 안 올라가길 원한다, repo 폭증을 막기 위해.
18. **디렉터로서**, Claude Code에서 각본을 수정하면 웹이 자동으로 변경을 감지해 새로고침되길 원한다, 두 도구를 끊김 없이 오가기 위해.
19. **디렉터로서**, 웹에서 가벼운 수정(screenplay 본문 한 줄, slugline, isStarred 토글)을 직접 할 수 있길 원한다, Claude Code를 켜지 않아도 되는 상황을 위해.
20. **디렉터로서**, Scene/Shot/Character/Location/Prop 어떤 객체도 웹에서 편집·생성·삭제 가능하길 원한다, 운영 권장은 외부 LLM이지만 응급 수정의 길은 열려 있길.
21. **디렉터로서**, 이미지(headshot/BodyProfile/FaceProfile/Location ref/Prop ref)를 웹에서 drag-and-drop으로 업로드하고 싶다.
22. **디렉터로서**, Take 영상을 웹에서 업로드하고 inline 플레이어로 즉시 확인하고 싶다.
23. **디렉터로서**, 데이터 정합성이 깨진 경우(존재하지 않는 Character를 참조하는 Shot 등) 부팅 시 명확한 에러로 알려주길 원한다, 무성하게 동작하는 것보다 멈춰주는 게 낫다.

## Implementation Decisions

### 모듈 (Clean Architecture)

도메인 로직은 프레임워크·파일 시스템·UI에 의존하지 않는다(`CLAUDE.md` 아키텍처 디폴트 준수). Ports/Adapters로 분리.

**Domain (frameworks-free, fully testable):**

- **MovieDomain** — Project/Scene/Shot/Take/Character/Look/Location/Prop의 타입·invariant·관계 정의.
  - 책임: 도메인 객체 생성·정합성 검증 (Shot.prevShotRef는 같은 Scene 안에서만; Take의 isStarred는 Shot당 ≤1; BodyProfile=3장·FaceProfile=5장 고정; Shot.duration ∈ [4,15]).
  - 인터페이스 폭: 작음(생성/검증 메소드). 구현 폭: 풍부(도메인 규칙 모두).

- **MarkerParser** — `screenplay.md` 텍스트에서 `<!-- shot:NN -->` … `<!-- /shot:NN -->` 블록 추출.
  - 인터페이스: `parse(markdown) → MarkerBlock[]`.
  - 구현: 중첩 거부, 미감김 마커 거부, 같은 Shot ID에 여러 블록 허용, normalize 규칙(앞뒤 공백 trim + 줄바꿈 정규화).

- **HashCalculator** — MarkerBlock의 normalized text → SHA-256.
  - 인터페이스: `hash(text) → string`.

- **SyncEvaluator** — 현재 각본의 marker block hash vs Shot/Take 저장 hash 비교.
  - 인터페이스: `evaluate(scene) → SyncStatus[]` (per-Shot: `current` | `shot-stale` | `take-stale` | `orphan`).

**Adapter (파일 시스템 ↔ 도메인):**

- **ProjectRepository** — `data/` 디렉토리를 스캔해 도메인 객체로 로드, 도메인 객체를 yaml/md로 저장.
  - 인터페이스: `loadProject()`, `loadScene(slug)`, `saveScene(scene)`, `loadCharacter(name)`, `saveCharacter(c)`, 그 외 도메인 객체별 load/save.
  - 구현: yaml/md 파싱·schema 검증·marker ↔ Shot 매핑·역참조 검증.

- **AssetStore** — `assets/` 디렉토리. 바이너리 업로드/조회/삭제.
  - 인터페이스: `upload(domain, owner, file) → RelativePath`, `resolve(path) → AbsolutePath`, `remove(path)`.
  - 구현: 파일명 규칙(slug-based) · 디렉토리 자동 생성 · 파일 충돌 핸들링.

- **ScreenplayWriter** — `screenplay.md` 본문 수정 시 마커 블록 일관성 유지(웹에서 편집 시).
  - 인터페이스: `replaceBody(scene, newMarkdown)`, `addShotMarker(scene, shotId, position)`, `removeShotMarker(scene, shotId)`.

- **FileWatcher** — `data/` 변경을 감지해 클라이언트에 reload 트리거.
  - 인터페이스: `subscribe(path, callback)`.

**Web layer:**

- **WebServer** — 로컬 서버. 도메인 객체를 JSON으로 직렬화해 클라이언트에 제공, 클라이언트 변경을 ProjectRepository/AssetStore로 위임. SSE/WebSocket으로 file change 푸시.
- **WebApp (SPA)** — 메인 뷰(영화 전체 스크롤) / Asset Library 뷰 / 편집 UI / 업로드 UI.

### 기술 스택

- **고정**: TypeScript + React + 로컬 dev 서버(파일 시스템 접근 권한 필요).
- **추천**: Next.js (App Router) + Tailwind. 풀스택 단일 프레임워크에서 파일 시스템 access(server actions/route handlers) + SPA UI.
- **대안**: Vite + React + Hono/Express (더 가벼움). 첫 슬라이스 구현 시 확정.

### 도메인·저장 결정 (CONTEXT.md 따름)

- 도메인 어휘는 `CONTEXT.md` 따름. 새 용어 발명 X — 필요하면 grill로 돌아간다.
- 저장 형식: YAML + Markdown — `docs/adr/0001-file-based-storage.md`.
- Scene 분기 = flat folder + `isStarred` boolean. 시퀀스는 폴더명 prefix 정렬.
- Screenplay ↔ Shot mapping = HTML comment marker.
- Sync = hash 비교, 자동 결정 X (Take는 immutable).

### 데이터 정합성

- ProjectRepository가 부팅 시 모든 yaml schema 검증 + 도메인 invariant 검증 + 역참조 검증(Shot의 character/location/prop ref가 실제 존재하는지).
- 깨진 경우: 어느 파일·어느 필드가 문제인지 명확한 에러. 무성한 fallback 금지.

### 동기화 (Claude Code ↔ Web)

- 웹 서버가 `data/` 변화를 감지해 클라이언트에 SSE/WebSocket reload 트리거.
- 같은 파일을 두 도구가 수정할 때의 race는 사용자 1명 가정으로 충돌 가능성 낮음 — 발생 시 후행 저장이 이김(last write wins). 명시적 lock 미도입.

## Testing Decisions

### 좋은 테스트의 정의 (CLAUDE.md 디폴트)

- **외부 동작만 검증**. 구현 디테일에 결합 X.
- **도메인 모듈(MovieDomain · MarkerParser · HashCalculator · SyncEvaluator)은 테스트 우선 작성**(TDD).
- Adapter(ProjectRepository · AssetStore · ScreenplayWriter)는 실제 파일 시스템 + 임시 디렉토리로 integration test.
- UI는 핵심 인터랙션(starred 토글·Scene 복사·이미지/Take 업로드·screenplay 편집)에 한해 E2E.

### 테스트할 모듈 / 형태

| 모듈 | 테스트 형태 | 핵심 검증 |
|---|---|---|
| MovieDomain | unit | invariants (cardinality·duration 범위·prevShotRef 범위) |
| MarkerParser | unit | 중첩·미감김·정규화 규칙·복수 블록 |
| HashCalculator | unit | normalize 후 결정성 (공백 차이가 hash 불변) |
| SyncEvaluator | unit | 각 SyncStatus 케이스 |
| ProjectRepository | integration | 임시 `data/` round-trip (load → save → load 동치) |
| AssetStore | integration | 임시 `assets/` 업로드·resolve·삭제 |
| ScreenplayWriter | integration | 마커 일관성 유지 |
| Web 인터랙션 | E2E (Playwright 등) | starred 토글·Scene 복사·업로드·편집 |

### Prior art

신규 프로젝트라 내부 prior art 없음. 외부 참고(직접 의존 X): 정적 사이트 생성기(Astro, Eleventy)의 디렉토리 기반 컨텐츠 로딩 패턴.

## Out of Scope

- **씨댄스 2.0 API 직접 호출 / 자동 영상 생성** — Take 생성은 외부 도구에서 진행하고 결과만 업로드.
- **여러 영화 동시 관리** — 1 인스턴스 = 1 영화. 다른 영화는 별도 폴더/repo.
- **다중 사용자 협업·권한 관리** — 디렉터 1명 가정.
- **DB·서버 인프라** — `docs/adr/0001-file-based-storage.md`.
- **자동 백업·클라우드 sync** — git이 메타 트래킹 책임, 바이너리는 디렉터 책임.
- **Comment thread / 리뷰 워크플로** — 필요 시 별도 PRD.
- **각본 자동 분석·LLM 통합**(자동 Shot 분할 등) — Authoring은 외부 Claude Code.
- **빠른 미리보기 영상 편집** — Take 채택까지만, 최종 편집은 외부 NLE.
- **Bulk-acknowledge UI** — 큰 폭 재작성 시 stale 일괄 처리, 신호 누적되면 별도 PRD.
- **모바일/태블릿 반응형** — 데스크탑 우선.
- **사용자 인증** — 로컬 단일 사용자.

## Further Notes

- 도메인 정의: `CONTEXT.md`
- 저장 결정 사유: `docs/adr/0001-file-based-storage.md`
- 영화 컨셉/시나리오 아웃라인(첫 사용 영화 PTSD의 컨텐츠): `docs/concept.md`, `docs/scenario_outline.md`
- 향후 후속 ADR 후보:
  - 캐시(SQLite/메모리) 도입 — 로딩 시간 > 2초 또는 쿼리 부담이 의미 있어지면.
  - DB 이행 — 다중 사용자/SaaS화/영화 N편 동시 관리 시.
  - File watcher 성능 — 영화 사이즈 폭증 시.
