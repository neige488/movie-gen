import type { CanvasActDto, MovieDto } from "../../shared/dto.js";

/**
 * BS2 Canvas — read-only (slice #20).
 *
 * Renders the movie's starred Scenes across the 3 BS2 act rows. Each row shows:
 *  - a *beat ruler*: the act's BS2 beats laid out as proportional ticks whose
 *    widths come from Blake's page annotations (server-computed in BeatSheet,
 *    shipped in `CanvasActDto.beats`). A visual guide only.
 *  - the act's starred Scenes as **equal-width** blocks (length ignored, per
 *    PRD) in manifest order.
 *
 * No drag / reorder here — that is slice #21. This view only reads the DTO.
 *
 * First-run is fine: after migration every Scene sits in act 1, so the canvas
 * shows them all clustered in the act-1 row (per AC).
 */

const ACT_TITLES: Record<1 | 2 | 3, string> = {
  1: "1막",
  2: "2막",
  3: "3막",
};

interface Props {
  movie: MovieDto;
}

export function BS2Canvas({ movie }: Props) {
  const acts = movie.acts;
  if (!acts || acts.length === 0) {
    return (
      <div className="status">
        캔버스 데이터를 불러올 수 없습니다 (매니페스트 미연결).
      </div>
    );
  }

  // slug → slugline lookup so blocks can show a human-readable label.
  const sluglineBySlug = new Map(
    movie.allScenes.map((s) => [s.slug, s.slugline]),
  );

  const totalStarred = acts.reduce((acc, a) => acc + a.sceneSlugs.length, 0);

  return (
    <div className="canvas">
      <header className="canvas__header">
        <h2 className="canvas__title">BS2 캔버스</h2>
        <p className="canvas__subtitle">
          starred Scene {totalStarred}개가 1/2/3막에 어떻게 분포하는지, 각 막의
          비트 가이드 위 어디쯤에 떨어지는지 봅니다. 읽기 전용 — 드래그는
          준비 중입니다.
        </p>
      </header>
      {acts.map((act) => (
        <ActRow key={act.id} act={act} sluglineBySlug={sluglineBySlug} />
      ))}
    </div>
  );
}

function ActRow({
  act,
  sluglineBySlug,
}: {
  act: CanvasActDto;
  sluglineBySlug: Map<string, string>;
}) {
  // Equal-width Scene blocks: each block owns 1/N of the row (length ignored).
  const blockWidthPct =
    act.sceneSlugs.length > 0 ? 100 / act.sceneSlugs.length : 0;

  return (
    <section className="canvas-act" aria-label={`${ACT_TITLES[act.id]} row`}>
      <div className="canvas-act__label">
        <span className="canvas-act__title">{ACT_TITLES[act.id]}</span>
        <span className="canvas-act__count">
          {act.sceneSlugs.length} scene
          {act.sceneSlugs.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Beat ruler — proportional ticks (Blake page-span widths). */}
      <div className="canvas-act__ruler" role="presentation">
        {act.beats.map((beat) => (
          <div
            key={beat.number}
            className="canvas-beat"
            style={{ width: `${beat.widthPct}%` }}
            title={`${beat.number}. ${beat.label} (p.${
              beat.startPage === beat.endPage
                ? beat.startPage
                : `${beat.startPage}-${beat.endPage}`
            })`}
          >
            <span className="canvas-beat__label">{beat.label}</span>
          </div>
        ))}
      </div>

      {/* Scene blocks — equal width, manifest order. */}
      <div className="canvas-act__scenes">
        {act.sceneSlugs.length === 0 ? (
          <div className="canvas-act__empty">— 이 막에 배치된 Scene 없음 —</div>
        ) : (
          act.sceneSlugs.map((slug) => (
            <a
              key={slug}
              className="canvas-scene"
              style={{ width: `${blockWidthPct}%` }}
              href={`#scene-${slug}`}
              title={sluglineBySlug.get(slug) ?? slug}
            >
              <span className="canvas-scene__slug">{slug}</span>
              <span className="canvas-scene__slugline">
                {sluglineBySlug.get(slug) ?? ""}
              </span>
            </a>
          ))
        )}
      </div>
    </section>
  );
}
