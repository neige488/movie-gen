# ADR 0001 — 산출물을 YAML + Markdown 파일로 저장한다 (DB 미사용)

- **Status**: Accepted
- **Date**: 2026-06-03

## Context

본 도구는 영화 한 편 분량의 산출물(각본·Shot prompt·캐릭터/로케이션/소품 메타데이터)을 저장·관리한다. 결정 시점에 다음 제약/요구가 명시되었다:

- 각본·Shot prompt 작성은 Claude Code(외부 LLM 도구)에서 대화로 진행한다(별도 합의).
- 작성된 산출물은 git에 트래킹되어야 한다 — 변경 이력(어떤 대사가 언제 어떻게 바뀌었나, 어떤 프롬프트 시도가 있었나)이 영화 제작 과정의 핵심 자산.
- 사용자는 디렉터 1명, 영화 단위 데이터량은 ~수 MB.
- 미래에 DB 이행 가능성을 사용자가 언급("나중에 DB로 들어갈 거 생각하고").

## Decision

산출물은 **YAML(메타데이터) + Markdown(각본 본문) 파일**로 저장한다. DB는 사용하지 않는다.

- Scene은 폴더(`data/scenes/{slug}/`), 그 안에 `scene.yaml`(slugline 등), `screenplay.md`(각본), `shots.yaml`(Shot 배열).
- Character/Location/Prop은 도메인별 폴더, 각 객체가 단일 YAML 파일.
- 이미지/영상 바이너리는 `assets/`에 두고 `.gitignore`. 메타데이터에는 상대 파일명만 박는다.

## Alternatives

- **A: 처음부터 DB(SQLite/Postgres)에 저장** → reject. 이유:
  - Claude Code의 텍스트 편집 흐름이 깨짐(SQL/API 어댑터를 매번 거쳐야 함).
  - git diff/history를 잃음 — 변경 이력이 핵심 자산인데 DB dump는 diff가 무의미.
  - 단일 사용자·영화 단위 데이터량(~수 MB)에서 트랜잭션/외래키/쿼리 최적화의 이득 미미.

- **B: 단일 마스터 파일(`movie.yaml`)** → reject. 큰 파일 하나는 git diff/리뷰가 깔끔하지 않고, Claude가 부분 수정할 때마다 전체 컨텍스트 로드 비용 발생.

- **C: Markdown만 사용 (frontmatter에 메타데이터 전부)** → reject. Shot 배열·Character looks 등 정형 데이터가 비대해지면 frontmatter가 비대해져 가독성·diff가 나빠짐.

## Consequences

- **긍정**:
  - Claude Code가 `.md`/`.yaml`을 자연어 대화로 편집하기 쉽다(Authoring is external 합의 보존).
  - 변경 이력이 `git log -p`로 그대로 추적된다.
  - 인프라 의존 0 (DB 서버·마이그레이션 도구 불필요).
  - 다른 머신/협업자에게 폴더 복사만으로 이식 가능.

- **부정 / 비용**:
  - 참조 무결성(예: Shot이 가리키는 Character ID가 존재하는지)을 도구가 직접 검증해야 함. 외래키 같은 강제 없음.
  - "이 캐릭터가 등장하는 모든 Shot" 같은 쿼리는 모든 YAML을 파싱해야 함.

- **완화**:
  - 웹 뷰어 부팅 시 모든 파일을 메모리(또는 SQLite 캐시)에 로드 → 쿼리는 캐시에서, 쓰기는 파일에. 소스 of truth는 항상 파일. 캐시는 git ignore.
  - 데이터 검증은 로딩 단계에서 schema validator로 수행.

- **후속 작업**:
  - DB 이행이 필요해지는 시점(예: 다중 사용자, SaaS화, 영화 N편 동시 관리)이 오면, YAML/MD가 정형이라 import 스크립트로 1회 마이그레이션 가능. 그 시점에 별도 ADR로 결정.

- **측정**: 영화 한 편 완성 시점에 데이터 로딩 시간 > 2초 또는 변경 충돌 빈도가 의미 있는 수준에 도달하면 캐시 도입(완화 항목) 검토 트리거.
