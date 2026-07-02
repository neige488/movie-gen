# Seedance 2.0 프롬프트 작성 완전 가이드 — AI 단편영화 제작자를 위한 실전 매뉴얼

## TL;DR
- **Seedance 2.0의 핵심은 "감독처럼 지시하기"다.** 모든 업로드 소재에 `@Image1`, `@Video1`, `@Audio1` 방식으로 명확한 "역할"을 부여하고(무엇을 참조할지 지정), 문장은 "형용사 나열"이 아니라 "주체→동작→환경→카메라→스타일→제약"의 순서로 쓴다. 이미지-투-비디오(I2V)에서는 외모 묘사를 생략하고 오직 움직임·카메라만 지시하는 것이 정답이다.
- **멀티 레퍼런스가 2.0의 최대 무기다.** ByteDance Seed 공식 발표 기준으로 "이미지 9장 + 영상 3개 + 오디오 3개 + 자연어 지시를 동시 입력"(총 12개 파일)까지 가능하며, "캐릭터=이미지, 동작/운동=영상, 리듬=오디오, 스토리=텍스트"로 역할을 분담시키면 캐릭터 일관성과 카메라 워크를 동시에 잡을 수 있다. 캐릭터 일관성을 위해서는 레퍼런스를 적게(2~3장) 쓰고, 동일 캐릭터를 여러 컷에서 매번 같은 `@` 태그와 동일한 표현으로 고정하는 것이 핵심이다.
- **단편영화 제작자라면**: (1) 캐릭터 레퍼런스 시트를 먼저 만들고, (2) "캐릭터 블록(고정)+씬 블록(변동)" 구조로 프롬프트를 관리하며, (3) 한 클립 안에 다중 샷(멀티샷)을 타임라인(0-3s, 3-6s…)으로 지시하고, (4) 드리프트가 누적되면 원본 레퍼런스 시트로 되돌아가라. 실사 인물 얼굴 업로드는 차단되므로 AI 생성 캐릭터 이미지를 써야 한다.

## Key Findings

1. **공식 프롬프트 공식은 6단계다**: 주체(Subject) → 동작(Action) → 환경(Environment) → 카메라(Camera) → 스타일(Style) → 제약(Constraints). 권장 길이는 약 60~100 단어이며, 프롬프트가 지나치게 길면 지시가 충돌해 품질이 떨어진다.
2. **입력 한도(공식)**: ByteDance Seed 공식 출시 블로그("Official Launch of Seedance 2.0")는 "Users can simultaneously input up to 9 images, 3 video clips, 3 audio clips, plus natural language instructions"라고 명시한다. 총 파일 수는 12개, 영상·오디오 총 길이는 각 15초 이내다. fal.ai 공식 API 문서도 "up to 9 images, up to 3 videos (total duration ≤15s), up to 3 audio files (MP3, total duration ≤15s)... combine up to 12 files total"로 동일하게 규정한다.
3. **`@` 참조 문법이 공식 인터페이스 규약이다**: 즉몽(Jimeng) 한국어/중국어 UI에서는 `@图片1`, `@视频1`, `@音频1`, 영문 UI(BytePlus/Dreamina)에서는 `@Image1`, `@Video1`, `@Audio1`로 태깅한다. 공식 문서의 "Image 1 / Image 2" 표기는 이 `@` 태그의 텍스트 표현일 뿐 별개 문법이 아니다.
4. **두 가지 모드**: (a) 첫/끝 프레임 모드(Dreamina에서 "Single-frame"/"Pro 2.0", 이미지 최대 2장) — 시작(및 선택적 끝) 이미지를 주고 그 사이를 보간. (b) 전능 참조(Omni/All-Round Reference, "Multiframes") — 이미지·영상·오디오를 섞어 각각 역할을 지정하는 2.0의 핵심 모드.
5. **네거티브 프롬프트**: 별도의 네거티브 프롬프트 입력란은 없다. 공식 가이드는 "원하는 것을 긍정문으로 서술"하고, 회피 사항은 프롬프트 끝의 "제약 조건(约束条件)"으로 인라인 서술하도록 안내한다. 다만 커뮤니티/서드파티 가이드에서는 "avoid jitter, avoid bent limbs" 같은 부정 표현도 실효가 있다고 보고하는 등 견해가 갈린다(아래 상세 참조).
6. **캐릭터 일관성**은 2.0의 강점이지만 완벽하지 않다. 얼굴형·머리카락·액세서리가 컷을 거치며 서서히 변하는 "아이덴티티 드리프트"가 있으며, 격렬한 모션·얼굴을 가리는 앵글일수록 심해진다.
7. **멀티샷 스토리텔링**이 네이티브로 지원된다. 한 프롬프트 안에서 최대 5개의 서로 다른 샷/장소/카메라를 지시해 하드컷이 들어간 연속 클립을 한 번에 생성할 수 있다.
8. **실사 인물 얼굴 업로드는 차단**된다(딥페이크 방지). AI 생성 인물, 일러스트, 3D 렌더는 통과된다. 즉몽 앱에서는 본인 실명 인증 후 "본인 출연"이 가능하다.
9. **모델 성능 맥락**: 2.0은 오디오·비디오를 한 번에 생성하는 듀얼브랜치 디퓨전 트랜스포머(45억 파라미터, "Dual-Branch Diffusion Transformer (4.5 billion parameters) that generates audio and video simultaneously in one pass" — Scenario 지식베이스) 아키텍처다. 독립 벤치마크 Artificial Analysis Video Arena에서 출시 시점 1위(ELO 텍스트-투-비디오 1,269 / 이미지-투-비디오 1,351)로 Kling 3.0·Veo 3·Runway Gen-4.5를 앞섰다.

## Details

### 1. 기본 원칙 — "소설가"가 아니라 "감독"으로 쓰기

Seedance 2.0은 자연어 논리를 깊게 따르는 모델이라, 추상적 감정어("슬프다", "긴장된다")는 이해하지 못하고 **물리적·시각적 디테일**로 번역해줘야 한다. 커뮤니티에서 정리한 원칙: AI는 "슬픔"은 모르지만 "헝클어진 머리카락", "핏기 없는 손끝", "깨진 반사상"은 안다. "긴장"은 모르지만 "급격히 수축하는 동공", "턱을 타고 흐르는 식은땀", "옷깃을 들썩이는 가쁜 호흡"은 안다.

**공식 6단계 공식 (영문 T2V 기준)**
```
[Subject], [Action], in [Environment], camera [Camera Movement], style [Style], avoid/keep [Constraints]
```
좋은 예:
```
A skateboarder lands a clean trick in an empty dawn parking lot,
camera low tracking shot then subtle rise, modern cinematic contrast,
6 seconds, 16:9, smooth stable motion, no bent limbs.
```
나쁜 예 (형용사만 나열, 지시 없음):
```
cool skateboard video, cinematic, fast, amazing tricks, lots of movement, epic style
```

**중국어 커뮤니티의 8차원 확장 공식** (신규 사용자에게 인기):
```
주체 + 동작 + 장면 + 광影(조명) + 렌즈 언어(운镜) + 스타일 + 화질 + 제약
```
중국어 예시(복붙용):
```
一位年轻女生在海边慢走，微风拂动头发，微笑看向镜头，黄昏暖光，
4K高清，电影感，稳定运镜，画面流畅不抖动，细节清晰，
五官清晰、面部稳定不扭曲，同一角色、服装一致、发型不变。
```

**길이와 언어**:
- 공식 권장 60~100 단어. 프롬프트 하드 캡은 3,000자.
- 영어·중국어 모두 네이티브로 이해한다. 실전 권장(커뮤니티): **장면 묘사·감정 디테일은 중국어**(시각적 은유가 더 정밀), **카메라 용어·스타일 지시어는 영어**("slow dolly in, shallow depth of field, golden hour backlighting")로 섞어 쓰면 양쪽의 장점을 취할 수 있다. 다만 영어가 여전히 좀 더 안정적이라는 보고가 많다.
- 참고: 콘텐츠 안전 필터는 영어 키워드 위주로 설계돼 있어, 정당한 장면인데도 영어에서 반복 차단되면 장면 묘사를 중국어로 번역하고 대사/자막만 영어로 두면 통과율이 올라간다는 커뮤니티 보고가 있다.

### 2. 이미지-투-비디오(I2V) 프롬프트 — 무엇을 쓰고 무엇을 뺄 것인가

**핵심 원칙: 이미지가 이미 정의한 것은 프롬프트에서 반복하지 마라.** 이미지가 인물의 외모·구도·색·조명을 이미 담고 있으므로, I2V 프롬프트는 **오직 "움직임"과 "카메라 동작"에 집중**한다.

| 요소 | 텍스트-투-비디오 | 이미지-투-비디오 |
|---|---|---|
| 주체 외모 묘사 | 상세히 필수 | **이미지에 있으므로 생략** |
| 동작 묘사 | 전체 서술 | 동적 변화에 집중 |
| 구도 유지 | 해당 없음 | **"preserve composition and colors" 강조** |
| 카메라 | 자유 | 이미지 구도와 정합되게 |

I2V 표준 예시:
```
Animate the provided image, preserve composition and colors,
add gentle wind motion to the leaves, camera slowly pushes in,
keep consistent lighting, 6 seconds.
```

**첫/끝 프레임 모드(Single-frame / "Pro 2.0")**: 시작 이미지 1장(+선택적 끝 이미지 1장, 최대 2장)을 주고 그 사이를 보간한다. 시작=인물이 서 있는 이미지, 끝=앉은 이미지를 주면 그 사이 동작을 채운다. 이 모드에서는 **종횡비가 업로드 이미지에 의해 고정**되며 프롬프트로 덮어쓸 수 없다. 격투 같은 복잡한 시퀀스에도 강력하다(예: 시작=온전한 카지노, 끝=파괴된 카지노 → "이것은 격투 씬의 오프닝과 클로징 장면이다. 그 사이의 안무를 시네마틱하게 생성하라").

**I2V에서 자주 하는 실수**: 이미지에 이미 보이는 캐릭터 외모를 프롬프트에 또 묘사하면, 텍스트 묘사와 이미지가 충돌해 얼굴이 뭉개지거나 드리프트가 생긴다. I2V에서는 "@Image1의 인물이 …한다"처럼 태그로 지시하고 외모는 적지 않는다.

### 3. 멀티 레퍼런스 활용 — 2.0의 최대 강점

**입력 한도(공식, ByteDance Seed 발표 및 fal.ai 공식 API 문서 기준)**:
- 이미지 최대 **9장** (jpeg/png/webp/bmp/tiff/gif, 개당 30MB 미만, 최소 300px)
- 영상 최대 **3개** (mp4/mov, 총 길이 2~15초, 개당 50MB 미만)
- 오디오 최대 **3개** (mp3/wav, 총 길이 15초 이내)
- **총 파일 12개 이내** (모든 모달리티 합산)
- 참고: 일부 서드파티 문서가 "이미지 최대 4장"이라고 표기하나, 공식 수치는 9장이다.

**`@` 태그로 각 소재에 "역할" 부여** — 이것이 2.0에서 가장 중요한 상호작용 방식이다. 소재만 업로드하고 역할을 안 적으면 모델이 추측해 품질이 떨어진다.

약한 프롬프트:
```
@image1 @image2 @video1 create a 12-second cinematic video
```
좋은 프롬프트:
```
@image1 as first-frame reference
@image2 as outfit and material reference
@video1 as camera movement and pacing reference
Create a 12-second nighttime chase scene in a subway station.
```

**소재별 최적 용도**:
- **이미지**: 첫/끝 프레임, 캐릭터 외모·의상, 제품 실루엣·질감, 장면 무드·팔레트·구도
- **영상**: 카메라 무브먼트, 신체 동작·블로킹, 전환 리듬, 샷 페이싱
- **오디오**: 음색, BGM 무드, 앰비언스, 비트 타이밍
- **텍스트**: 샷별 연출, 동작·타이밍, 대사, 제약, 서사 논리

**공식 멀티 이미지 참조 문형**:
```
Reference / Extract / Combine / Follow + [Image N]'s [요소], generate [장면], maintaining consistent [요소] features.
```

공식 캐릭터 참조 예시(다각도 참조):
```
Reference the woman's appearance from Image 1, Image 2, and Image 3,
generate a scene of her eating cake at a coffee shop.
```

공식 다요소 참조 예시(인물+의상+장면+로고):
```
The scene is set inside the restaurant from Image 4, with people coming and going.
The girl from Image 1 is wearing the outfit from Image 2, tidying up items on the counter.
The boy from Image 3 is a customer who walks up to ask the girl for her contact information.
The logo from Image 5 is always displayed in the bottom-right corner of the screen.
```

**영상 레퍼런스로 카메라·동작·이펙트 복제**: 2.0의 킬러 기능. "무엇을 참조할지"와 "무엇을 생성할지"를 **한 문장에 섞지 말고 분리**해서 쓴다.
- 동작 참조: `Reference the character actions and camera language from Video 1, generate a fight scene between Image 2 (left) and Image 1 (right).`
- 카메라 참조: `Reference @video1 for all camera movement. Generate a tense hallway scene with one character. At the moment of panic, use a Hitchcock-style zoom, then a slow orbit.`
- 이펙트 참조: `Reference the golden particle effects from Video 1, have the character from Image 1 play a flute surrounded by the same particles.`

**여러 참조의 우선순위 / 블렌딩**: 모델은 각 소재에서 핵심 특징을 자동 추출해 텍스트와 결합한다. 업로드 슬롯이 부족하면 우선순위는 **① 카메라/모션 레퍼런스 → ② 주체/제품 일관성 레퍼런스 → ③ 무드/오디오** 순으로 배분하라. 커뮤니티 실전 권장 배분: 핵심 이미지 3~5장 + 참조 영상 1~2개 + 오디오 1개, 여유 슬롯 남기기(5~8개 선에서 관리).

**전능 참조(Omni) vs 첫/끝 프레임 모드 선택**:
- 단순히 시작 이미지+텍스트만 필요 → 첫/끝 프레임 모드
- 이미지+영상+오디오 혼합 → 전능 참조 모드(2.0의 전 기능 해제)
- 주의: 대부분 인터페이스에서 **첫/끝 프레임 이미지와 참조 이미지/영상을 동시에는 쓸 수 없다**. 둘 중 하나를 택해야 한다.

### 4. 카메라 무브먼트 어휘 — 안정적으로 먹히는 용어

Seedance 2.0은 표준 영화 문법 용어로 학습돼 있어 아래 용어를 그대로 쓰면 잘 반응한다. 공식 가이드가 정리한 8종:

| 유형 | 영문 용어 | 효과 | 적합 상황 |
|---|---|---|---|
| 푸시인 | push-in / dolly in | 피사체로 서서히 접근 | 클로즈업 강조, 감정 집중 |
| 풀아웃 | pull-out / dolly out | 멀어지며 와이드 공개 | 환경 공개, 공간 맥락 |
| 팬 | pan | 수평 회전 | 피사체 추적, 장면 스캔 |
| 트래킹 | tracking shot / follow | 피사체 이동 추종 | 액션, 걷는 인물 |
| 오빗 | orbit / arc | 피사체 주위 회전 | 제품·인물 쇼케이스 |
| 항공 | aerial / drone shot | 고공·부감 | 풍경, 도시, 웅장한 스케일 |
| 핸드헬드 | handheld | 자연스러운 미세 흔들림 | 다큐, 리얼리즘 |
| 고정 | fixed / locked-off | 완전 정지 | 피사체 동작에 집중 |

추가로 잘 먹히는 표준 용어: tilt up/down, rack focus, crane up, low-angle tracking, over-the-shoulder, first-person diving perspective, whip pan, Hitchcock zoom(돌리 줌).

**카메라 3대 규칙**:
1. **주 카메라 지시는 하나만.** 복합 무브가 필요하면 "primary 다음 secondary" 순으로(예: `camera low tracking shot then subtle rise`). "push-in, then pan left, zoom out, orbit"처럼 여러 지시를 섞으면 화면이 떨린다.
2. **기술 사양이 아니라 리듬어를 써라.** "24fps, f/2.8, ISO 800" 대신 "slow, smooth, stable, gradual, gentle". 편집자에게 말하듯 리듬을 서술.
3. **카메라 움직임과 피사체 움직임을 분리 서술하라.** ✅ "The dancer spins slowly. Camera holds fixed framing." ❌ "spinning camera around a dancing person"(가장 흔한 실수, 화면 흔들림 유발).

**속도어**: imperceptible/barely(극느림) → slow/gentle/gradual(느림) → smooth/controlled(중간) → dynamic/swift(빠름, 주의). "fast"는 품질을 가장 크게 떨어뜨리는 단어이며, 빠른 카메라+빠른 컷+복잡한 장면을 동시에 요구하면 거의 확실히 아티팩트가 생긴다. 빠른 페이스가 필요하면 한 요소만 빠르게 하라.

**조명이 최고 레버리지**: 공식 가이드는 "모든 프롬프트 요소 중 조명 묘사가 품질에 가장 큰 영향을 준다"고 강조한다. 딱 한 줄만 추가할 수 있다면 조명을 넣어라: golden hour, rim light, natural window light, neon-lit, backlit silhouette, overcast diffused light 등.

### 5. 멀티샷 / 멀티신 — 한 클립 안에서 서사 만들기

2.0은 한 번의 생성으로 최대 5개의 서로 다른 샷을 하드컷으로 이어 붙인 연속 클립을 만든다. 핵심 기법은 **타임라인 프롬프트**다.

**타임라인 구조 예시**:
```
[00:00] A woman stands alone in a foggy street at night. Wide shot. Soft blue lighting.
[00:04] She begins walking toward the camera. Slow dolly in.
[00:07] Close-up as she stops and looks directly into the lens. Subtle wind in her hair.
```
- 5초 클립이면 타임스탬프 2~3개, 각 비트는 2~3문장, 한 비트당 하나의 주 동작.
- 전환은 "cut to next scene"라고 쓰지 말고 **무엇이 전환을 시작해 어떻게 이동하고 무엇으로 해소되는지**를 동작처럼 서술하라.

**공식 멀티 이미지 스토리보드 예시**(딸-아빠 저녁식사, 대사 포함):
```
Follow the storyboard composition from Image 3. A girl is waiting for her dad to finish cooking.
She says: "Dad, I'm hungry! Is dinner ready?" The girl's appearance references Image 1.
Then the camera pans right to switch to Image 4's scene. The dad's appearance references Image 2.
The dad replies: "Almost done, just wait a little!" Then cut back to a close-up of the daughter...
```

**멀티샷에서 일관성 유지법**:
- 샷마다 카메라 언어를 바꾸면 연속성이 깨진다. 먼저 2컷만 만들어 연속성을 확인한 뒤 확장하라.
- 조명 방향을 고정하고("soft daylight from camera-right, warm neutral palette"), 아이덴티티 앵커(캐릭터 태그+헤어스타일+의상)를 매 샷에 명시하라. 앵커를 안 쓰면 모델이 임의로 지어낸다.

**대사·자막·말풍선**: 
- 자막: `Subtitles appear at the bottom of the screen with the content "...", synchronized with the audio rhythm.`
- 대사(공식 문형): `[캐릭터] says: "..."` (역할명+동작+콜론+따옴표 대사). 방언·다국어 지정 가능하며, 립싱크는 정확히 8개 언어(English, Chinese/Mandarin, Japanese, Korean, Spanish, French, German, Portuguese)를 지원하고 음소 정렬 정확도는 ±40ms 수준이다(Scenario 지식베이스: "Phoneme-level alignment within +/- 40ms").
- 말풍선: `Speech bubbles appear around each speaking character with the corresponding dialogue.`
- 텍스트/로고: 흔한 문자만 쓰고 특수기호는 피하라. 로고는 별도 이미지로 참조.

### 6. 캐릭터 일관성 — 내러티브 필름메이킹의 핵심

**드리프트 4대 패턴**(커뮤니티 42개 시퀀스 테스트 기준): ① 특징 침식(흉터·피어싱·문신 등 작은 디테일부터 사라짐), ② 미러링(포즈 좌우 반전), ③ 스타일 시프트(채도·선 굵기·얼굴 비율이 컷을 거치며 변화), ④ 아이덴티티 블렌딩(두 레퍼런스 특징을 평균내 제3의 인물 생성).

**예방 기법(권장 순서)**:
1. **레퍼런스는 적게.** 6장 → 2장으로 줄였더니 후속 컷 드리프트가 약 60% 감소했다는 보고. 조명이 서로 다른 헤드샷 2장을 섞으면 오히려 블렌딩이 심해진다.
2. **캐릭터 레퍼런스 시트를 먼저 제작.** Midjourney/Dreamina로 정면·3/4·측면 뷰를 중립 배경에 생성. 3/4 앵글이 얼굴+체형 비율을 가장 잘 담아 기본값으로 좋다. 2K 이상, 균일한 조명, 선명한 초점.
3. **"캐릭터 블록 + 씬 블록" 분리 관리.** 불변 요소(나이대·헤어·1~2개 핵심 특징)를 하나의 고정 텍스트 블록으로 저장하고 매 프롬프트에 그대로 붙여넣는다. 예: "late 20s, tight dark curls at ear length, small silver hoop in left ear." 씬별 지시(앵글·동작·조명·감정)는 짧게 따로.
4. **동일 용어 반복.** "dark brown hair"를 한 컷에서 "brunette"로 바꾸면 변형이 생긴다. 동의어 금지, 묘사 순서도 매번 동일하게.
5. **`@` 태그를 매 샷에 반복.** 태그를 빼면 모델이 학습 데이터의 "평균 얼굴"로 회귀(드리프트)한다. 의상 변경 시엔 "@Character1 in the same black tuxedo defined in @Ref4"처럼 의상까지 명시(프롬프트 누수 방지).
6. **모션은 단순하게, 얼굴은 계속 보이게.** 격렬한 회전·뒤돌기·프로필 샷은 얼굴을 가려 재구성 오류를 유발한다. 얼굴이 클립 내내 보이면 모델이 더 열심히 정체성을 유지한다. 타이트한 트래킹/오빗 샷은 얼굴에 더 많은 픽셀을 할당해 유지율이 높다.
7. **의상 변경·환경 변경 시**: "now wearing [새 의상]" 구문으로 정체성 앵커는 유지한 채 변화만 신호. "The woman with short black hair @Image1, now wearing a formal business suit..."

**긴 시퀀스 = 씬 체이닝**: 한 생성물의 출력을 다음 생성의 레퍼런스로 사용. 단, 4~5회 체이닝하면 미세 변화가 누적(턱선이 부드러워지거나 머리색이 변함)되므로 **주기적으로 원본 레퍼런스 시트로 복귀**하라.

**회복 전략**: 드리프트가 시스템적이면 캐릭터 블록+엄격한 앵커로 재렌더. 국소적이면 후보정 합성이 재렌더보다 빠를 때 합성을 택하라.

### 7. 흔한 실패 모드와 하지 말아야 할 것

- **네거티브 프롬프트 남용**: 별도 네거티브 입력란은 없다. 공식 접근은 **원하는 것을 긍정문으로 서술**하고 회피 사항은 프롬프트 끝의 "제약 조건"으로 인라인 서술("画面稳定无抖动、面部不变形"). 단, 커뮤니티에서는 "avoid jitter / avoid bent limbs / no mirrored features" 같은 부정 표현이 실제로 잘 먹힌다는 보고와, "모델은 네거티브를 무시하니 부정어를 아예 지우라"는 상반된 보고가 공존한다 → **캐릭터 영상엔 긍정형 안정성 지시("smooth stable motion, natural human anatomy, consistent face")를 기본으로 쓰되, 필요 시 짧은 부정 제약을 실험적으로 추가**하는 것이 안전하다.
- **프롬프트 과적재**: 형용사 남발("beautiful, stunning, gorgeous")은 하나의 강한 단어로. "epic", "amazing", "cinematic"(단독) 등 모호어는 구체 지시로 대체("cinematic film tone, 35mm, warm").
- **지시 충돌**: 카메라 다중 지시, 스타일과 모션 상충(예: 잔잔한 무드 + 격렬한 모션)을 피하라.
- **"fast" 단독 사용**: 화면 붕괴의 주범.
- **실사 얼굴 업로드**: 차단됨. AI 생성/일러스트/3D 렌더로 대체.
- **한 변수씩만 수정**: 반복 개선 시 카메라·모션·스타일 중 하나만 바꿔야 무엇이 결과를 바꿨는지 추적 가능.
- **처리 시간**: 15초 멀티 레퍼런스 생성은 상당한 대기가 걸릴 수 있다. 대기열이 길면 Seedance 2.0 Fast 티어 활용.

### 8. Seedance 1.0/1.5 대비 2.0 프롬프트 차이

2.0은 1.0의 점진적 개선이 아니라 아키텍처 전면 재구축(오디오·비디오를 한 번에 생성하는 듀얼브랜치 디퓨전 트랜스포머, 45억 파라미터)이다. 프롬프트 관점의 핵심 변화:
- **1.0은 단일 이미지 레퍼런스만** 가능했으나 2.0은 이미지·영상·오디오 배열을 한 번에 참조 → `@` 역할 지정 프롬프트가 새로 필요.
- **1.0은 오디오 없음, 단일 샷** → 2.0은 네이티브 오디오·립싱크·멀티샷 → 대사/자막/비트 싱크 프롬프트가 유의미해짐.
- 손·사지 렌더링, 물리(옷 주름·물·충돌)가 크게 개선 → "describe forces, not just actions"(힘을 서술)하면 물리 엔진이 더 잘 반응(예: "tires smoke as the car drifts 90 degrees, rubber screaming, weight shifting to the outside").

### 9. 공식·서드파티 접근 경로 참고
- **공식**: 즉몽(Jimeng, jimeng.jianying.com), 도우바오(Doubao), 火山方舟(Volcano Ark) 체험센터. 공식 출시일은 ByteDance Seed 연구 페이지 기준 2026년 2월 12일(일부 리뷰는 2월 7일 조기 배포로 표기해 며칠 차이가 있음). Volcano Ark API는 480P/720P/1080P/4K, 4~15초 지원.
- **해외**: 오버시즈 API가 저작권 분쟁으로 지연/중단된 이력이 있어, Higgsfield, WaveSpeed, fal(2026년 4월 9일부로 공식 Seedance 2.0 API 제공), PixVerse 등 서드파티 경유가 흔하다. 이들 플랫폼의 UI별로 한도·표기가 조금씩 다를 수 있다.

## Recommendations

**1단계 — 셋업(촬영 전 프리프로덕션)**
- 주요 등장인물마다 정면·3/4·측면 레퍼런스 시트를 Seedream/Midjourney/Dreamina로 제작(2K+, 중립 조명, 3/4 우선). 실사 얼굴은 쓰지 말 것.
- 프로젝트 폴더 구조를 만들어 소재를 역할별로 분류: `캐릭터/ 장면/ 운镜참조/ 오디오/ 프롬프트.txt`.
- 각 인물의 "캐릭터 블록"(불변 텍스트, 동일 용어) 확정.

**2단계 — 첫 클립(파일럿)**
- 4초짜리 "아이덴티티 체크" 클립으로 캐릭터가 의도대로 나오는지 확인. 1번째 프레임이 틀리면 즉시 재생성.
- I2V라면 외모 묘사를 빼고 "preserve composition and colors" + 단일 카메라 무브만.
- 6단계 공식 + 조명 한 줄 + 긍정형 안정성 지시로 시작. 60~100 단어 유지.

**3단계 — 멀티샷 씬 구축**
- 전능 참조 모드로 캐릭터(이미지)+운镜(영상)+분위기(오디오) 역할 분담, 각 `@`에 역할 명시.
- 타임라인(0-3s/3-6s/…)으로 최대 5샷을 한 클립에 배치. 먼저 2컷만 확인 후 확장.
- 매 샷에 캐릭터 태그·헤어·의상·조명 방향 앵커 반복.

**4단계 — 길이 확장·연속성**
- 15초 초과분은 비디오 확장(Extend) 기능으로 "새로 추가되는 구간 길이"만큼만 duration 설정하고, 유지할 모션을 먼저·변경점을 나중에 서술.
- 4~5회 체이닝마다 원본 레퍼런스 시트로 복귀해 드리프트 리셋.

**5단계 — QA·반복**
- 앵커 감사(모든 불변 특징이 각 샷 프롬프트에 있는가), 특징 스캔(액세서리 유실·포즈 반전·조명 점프), 시드 일관성 체크.
- 한 번에 한 변수만 바꿔 재생성. 3~4개 변형을 만들어 가장 일관된 것을 선택.

**기준선(임계값) — 아래에 해당하면 접근을 바꿔라**:
- 드리프트가 얼굴형·손 지배성·주요 특징에 걸쳐 시스템적 → 레퍼런스를 2장으로 줄이고 시드 고정 후 재렌더.
- 영어 프롬프트가 정당한 장면인데 반복 차단 → 장면 묘사만 중국어로 번역, 대사/자막은 영어 유지.
- 화면 흔들림 지속 → 카메라 지시를 하나로 축소, "slow/smooth/stable" 추가, "fast" 제거.
- 캐릭터 일관성이 최우선인 프로젝트 → 격렬 모션·프로필/뒷모습 샷을 피하고 얼굴이 계속 보이는 미디엄/클로즈업+타이트 트래킹으로 설계.

## Caveats
- **입력 한도·해상도는 접근 경로별로 다르다.** 본문 수치는 ByteDance Seed 공식 발표·fal.ai 공식 API 문서·Volcano Ark 스펙 기준이며, Higgsfield/WaveSpeed 등 서드파티는 슬롯 수·해상도·모드명이 다를 수 있으니 각 플랫폼 UI를 확인하라.
- **공식 문서 본문은 JS 렌더링**이라 일부 세부 표(파일 크기·확장 규칙 등)는 공식 매뉴얼을 재현한 2차 출처(Tencent News, Zhihu 등)에서 취합했다. 총 12파일·개별 용량 상한은 이들 재현 출처 기준이며 공식 원문 축자 확인은 못 했다.
- **네거티브 프롬프트 효용은 견해가 갈린다**(공식=긍정형 권장, 일부 커뮤니티=부정 표현도 유효). 실험적으로 검증하며 사용할 것.
- **해상도 표기 혼재**: 소비자 UI/마케팅은 1080p·2K, Volcano Ark 상용 스펙은 최대 4K를 명시한다. Fast 티어는 720p까지.
- **저작권·실사 얼굴 정책은 유동적**이다. 실사 얼굴 업로드 차단은 2026년 2월 시행됐고, 해외 API 정책·상업적 라이선스 조건은 변경될 수 있으니 상업 프로젝트 전 최신 약관을 확인하라.
- 본 가이드의 상당수 실전 기법은 커뮤니티 실측(Reddit, Zhihu, Medium 등) 기반으로, 모델 업데이트(2.1/2.5 등)에 따라 달라질 수 있다.