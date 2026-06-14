# ADR 0002 — Scene 순서·막(Act) 구조를 중앙 매니페스트(`data/movie.yaml`)로 관리한다

- **Status**: Accepted
- **Date**: 2026-06-14
- **Supersedes**: ADR 0001의 암묵적 규칙 "영화 시퀀스 = Scene 폴더명 prefix 정렬" (파일 저장 모델 자체는 유지)

## Context

BS2(블레이크 스나이더 비트 시트) 캔버스 기능을 추가한다 — Scene을 1/2/3막 3개 row에 배치하고 드래그로 재정렬하는 시각 뷰. 이로써 두 가지 새 요구가 생겼다:

- **순서 편집성:** 디렉터가 Scenes 뷰와 캔버스 양쪽에서 Scene 전후 위치를 언제든 바꿀 수 있어야 한다. 기존엔 순서가 폴더명 prefix(`s01-`, `s02-`)에 박혀 있어, 재정렬하려면 폴더를 rename해야 했다.
- **막 배치:** 각 Scene이 어느 막에 속하는지를 저장해야 한다(디렉터 수동 결정). 막은 BS2상 순차적·연속적이다.

폴더 rename은 slug를 깨고(다른 메타데이터·링크가 slug로 Scene을 참조), Claude Code/웹 양쪽의 경로 가정을 흔든다. 순서를 폴더명에 의존하는 한 "언제든 재정렬"은 무거운 연산이 된다.

## Decision

Scene 순서 + 막 구조의 **단일 출처(SSOT)**를 `data/movie.yaml` 매니페스트에 둔다. 폴더명 prefix는 더 이상 순서를 결정하지 않으며 안정적 식별자(slug)로만 쓴다.

```yaml
# data/movie.yaml
acts:
  - id: 1
    scenes: [s01-prologue]
  - id: 2
    scenes: [s02-confrontation]
  - id: 3
    scenes: [s03-resolution-alt]
```

- (후속) 매니페스트는 영화 단위 설정 `totalPages`(BS2 총 분량, 기본 110)도 담는다. `saveArrangement`는 기존 `totalPages`를 읽어 보존하므로 재정렬이 이 값을 지우지 않는다.
- **모든** Scene(starred + non-starred)이 정확히 한 막에 속한다.
- **선형 영화 순서 = act1 ++ act2 ++ act3 flatten 후 `isStarred=true` 필터.** isStarred(scene.yaml)는 시퀀스/캔버스 포함 여부만 결정하고, 순서 자체는 매니페스트가 소유.
- 막은 순차적·연속적이므로 "순서≠막" 불일치가 표현 자체로 불가능하다.
- 재정렬·막 이동 = 이 파일 1개를 atomic 재작성. 진입점은 Scenes 뷰와 BS2 캔버스 둘 다 같은 매니페스트를 건드린다.
- 매니페스트가 없으면(초기 마이그레이션) 기존 모든 Scene을 1막에 넣어 생성하고 디렉터가 재분배.

## Alternatives

- **A: per-scene `order`(+`act`) 필드** → reject. 순서·막이 N개 `scene.yaml`에 흩어져 (1) 재정렬이 다수 파일 재작성, (2) order 값 충돌/중복·gap 전략 필요, (3) "act2인데 순서상 act1 사이" 같은 불일치 상태를 코드가 따로 검증해야 함. 순서·막은 개별 Scene의 내재 속성이 아니라 Movie 배열의 전역 관계라 한 곳에 모으는 게 도메인에 충실.
- **B: 드래그가 폴더 prefix를 물리적으로 rename** → reject. slug 참조 무결성을 깨고 무거우며 위험. 순서를 매번 디스크 구조에 동기화하는 비용.
- **C: 분량(Shot duration) 기반 자동 막/비트 배치** → 현재 보류(범위 밖). 막은 디렉터 수동 배치, 비트는 시각 가이드일 뿐 저장 안 함. 분량 X-ray는 향후 별도 결정.

## Consequences

- **긍정:**
  - 재정렬·막 이동이 파일 1개 atomic 재작성. 폴더 rename·slug 변경 없음.
  - 도메인('Movie는 3 Act, 각 Act는 순서 있는 Scene 리스트')과 1:1 매핑.
  - 막=연속구간 불변식이 자료구조로 보장됨(불일치 상태 불가).
  - Scenes 뷰·캔버스가 같은 SSOT를 공유 → 두 진입점이 자동 정합.

- **부정 / 비용:**
  - 새 동기화 책임: Scene 추가/삭제/복사 시 writer가 매니페스트도 갱신해야 함(매니페스트에 없는 Scene = 누락, 폴더 없는 slug = 댕글링). 로딩 단계에서 reconcile 필요.
  - `data/movie.yaml`이라는 단일 파일에 쓰기가 집중 → 동시 편집 시 마지막 쓰기 우선(단일 디렉터 가정에서 허용).

- **완화:**
  - 로딩 시 매니페스트 ↔ 실제 Scene 폴더를 reconcile: 폴더엔 있는데 매니페스트에 없는 Scene은 1막 끝에 append, 매니페스트엔 있는데 폴더 없는 slug은 drop.

- **후속:** 분량 기반 X-ray(실제 duration으로 씬 폭/비트 정렬 진단)는 효용이 확인되면 별도 ADR로.
