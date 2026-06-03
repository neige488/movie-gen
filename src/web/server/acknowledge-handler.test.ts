/**
 * Acknowledge handler — integration tests against real temp data/.
 *
 * Two orchestrators share the same module:
 *   - applyAcknowledgeShot — refreshes Shot.screenplayHash to the current
 *     marker block hash and persists shots.yaml. Takes are preserved.
 *   - applyAcknowledgeTake — refreshes Take.screenplayHash only. Other
 *     Take fields (videoPath, createdAt, isStarred) are preserved on disk.
 *
 * The mutations follow the same persist-then-rebuild pattern as
 * starred-toggle-handler so a subsequent /api/movie call reflects the new
 * state with no server restart.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { loadProject } from "@adapter/project-repository.js";
import { saveSceneShots } from "@adapter/project-writer.js";
import { createProject } from "@domain/movie.js";
import { computeScreenplayHash } from "@domain/hash-calculator.js";
import {
  applyAcknowledgeShot,
  applyAcknowledgeTake,
  AcknowledgeError,
} from "./acknowledge-handler.js";

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "moviegen-ack-"));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

const OLD_HASH = "0000000000000000000000000000000000000000000000000000000000000000";
const NEW_BODY = "new body here";
const NEW_HASH = computeScreenplayHash(NEW_BODY);

function writeScene(opts: {
  slug: string;
  screenplay: string;
  shotHash: string;
  takeHash?: string;
}): void {
  const sceneDir = path.join(dataDir, "scenes", opts.slug);
  mkdirSync(sceneDir, { recursive: true });
  writeFileSync(
    path.join(sceneDir, "scene.yaml"),
    `slugline: "INT. ${opts.slug.toUpperCase()} - DAY"\nisStarred: true\n`,
  );
  writeFileSync(path.join(sceneDir, "screenplay.md"), opts.screenplay);
  const takesYaml = opts.takeHash
    ? [
        `    takes:`,
        `      - id: t01`,
        `        videoPath: takes/s01/01-take01.mp4`,
        `        screenplayHash: "${opts.takeHash}"`,
        `        createdAt: "2026-06-01T00:00:00.000Z"`,
        `        isStarred: true`,
      ].join("\n")
    : `    takes: []`;

  writeFileSync(
    path.join(sceneDir, "shots.yaml"),
    [
      `shots:`,
      `  - id: "01"`,
      `    prompt: "wide"`,
      `    duration: 5`,
      `    screenplayHash: "${opts.shotHash}"`,
      `    characterRefs: []`,
      `    locationRefs: []`,
      `    propRefs: []`,
      takesYaml,
      ``,
    ].join("\n"),
  );
}

// ---------------------------------------------------------------------------
// applyAcknowledgeShot
// ---------------------------------------------------------------------------

describe("applyAcknowledgeShot — happy path", () => {
  it("updates Shot.screenplayHash to the current marker block hash and persists shots.yaml", async () => {
    writeScene({
      slug: "s01-open",
      screenplay: `<!-- shot:01 -->\n${NEW_BODY}\n<!-- /shot:01 -->\n`,
      shotHash: OLD_HASH,
    });
    const project = await loadProject(dataDir);
    expect(project.scenes[0]!.shots[0]!.screenplayHash).toBe(OLD_HASH);

    const result = await applyAcknowledgeShot({
      project,
      sceneSlug: "s01-open",
      shotId: "01",
      dataDir,
      saveSceneShots,
      createProject,
    });

    // In-memory project updated.
    expect(result.project.scenes[0]!.shots[0]!.screenplayHash).toBe(NEW_HASH);

    // YAML persisted.
    const yamlText = readFileSync(
      path.join(dataDir, "scenes", "s01-open", "shots.yaml"),
      "utf8",
    );
    expect(yamlText).toContain(NEW_HASH);

    // Reload picks it up.
    const reloaded = await loadProject(dataDir);
    expect(reloaded.scenes[0]!.shots[0]!.screenplayHash).toBe(NEW_HASH);
  });

  it("does not touch Takes (Take.screenplayHash preserved)", async () => {
    writeScene({
      slug: "s01-open",
      screenplay: `<!-- shot:01 -->\n${NEW_BODY}\n<!-- /shot:01 -->\n`,
      shotHash: OLD_HASH,
      takeHash: OLD_HASH,
    });
    const project = await loadProject(dataDir);

    const result = await applyAcknowledgeShot({
      project,
      sceneSlug: "s01-open",
      shotId: "01",
      dataDir,
      saveSceneShots,
      createProject,
    });

    // Take hash preserved in memory.
    expect(result.project.scenes[0]!.shots[0]!.takes[0]!.screenplayHash).toBe(
      OLD_HASH,
    );

    // Take hash preserved on disk too.
    const reloaded = await loadProject(dataDir);
    expect(reloaded.scenes[0]!.shots[0]!.takes[0]!.screenplayHash).toBe(
      OLD_HASH,
    );
  });

  it("does not touch screenplay.md or scene.yaml", async () => {
    writeScene({
      slug: "s01-open",
      screenplay: `<!-- shot:01 -->\n${NEW_BODY}\n<!-- /shot:01 -->\n`,
      shotHash: OLD_HASH,
    });
    const project = await loadProject(dataDir);
    const screenplayBefore = readFileSync(
      path.join(dataDir, "scenes", "s01-open", "screenplay.md"),
      "utf8",
    );
    const sceneFileBefore = readFileSync(
      path.join(dataDir, "scenes", "s01-open", "scene.yaml"),
      "utf8",
    );

    await applyAcknowledgeShot({
      project,
      sceneSlug: "s01-open",
      shotId: "01",
      dataDir,
      saveSceneShots,
      createProject,
    });

    expect(
      readFileSync(
        path.join(dataDir, "scenes", "s01-open", "screenplay.md"),
        "utf8",
      ),
    ).toBe(screenplayBefore);
    expect(
      readFileSync(
        path.join(dataDir, "scenes", "s01-open", "scene.yaml"),
        "utf8",
      ),
    ).toBe(sceneFileBefore);
  });
});

describe("applyAcknowledgeShot — validation", () => {
  it("rejects unknown Scene", async () => {
    writeScene({
      slug: "s01-open",
      screenplay: `<!-- shot:01 -->\n${NEW_BODY}\n<!-- /shot:01 -->\n`,
      shotHash: OLD_HASH,
    });
    const project = await loadProject(dataDir);
    await expect(
      applyAcknowledgeShot({
        project,
        sceneSlug: "ghost",
        shotId: "01",
        dataDir,
        saveSceneShots,
        createProject,
      }),
    ).rejects.toThrow(AcknowledgeError);
  });

  it("rejects unknown Shot", async () => {
    writeScene({
      slug: "s01-open",
      screenplay: `<!-- shot:01 -->\n${NEW_BODY}\n<!-- /shot:01 -->\n`,
      shotHash: OLD_HASH,
    });
    const project = await loadProject(dataDir);
    await expect(
      applyAcknowledgeShot({
        project,
        sceneSlug: "s01-open",
        shotId: "99",
        dataDir,
        saveSceneShots,
        createProject,
      }),
    ).rejects.toThrow(AcknowledgeError);
  });

  it("rejects acknowledge of orphan Shot (no matching marker)", async () => {
    // screenplay has no shot:01 marker — Shot is orphan
    writeScene({
      slug: "s01-open",
      screenplay: `# scene\nno markers here\n`,
      shotHash: OLD_HASH,
    });
    // loadProject throws on orphan shots only if invariant; check fixture
    // The current invariant allows orphan shots — we just produce a status.
    const project = await loadProject(dataDir);
    await expect(
      applyAcknowledgeShot({
        project,
        sceneSlug: "s01-open",
        shotId: "01",
        dataDir,
        saveSceneShots,
        createProject,
      }),
    ).rejects.toThrow(AcknowledgeError);
  });
});

// ---------------------------------------------------------------------------
// applyAcknowledgeTake
// ---------------------------------------------------------------------------

describe("applyAcknowledgeTake — happy path", () => {
  it("updates Take.screenplayHash to the current marker block hash and persists shots.yaml", async () => {
    writeScene({
      slug: "s01-open",
      screenplay: `<!-- shot:01 -->\n${NEW_BODY}\n<!-- /shot:01 -->\n`,
      shotHash: NEW_HASH,
      takeHash: OLD_HASH,
    });
    const project = await loadProject(dataDir);
    expect(project.scenes[0]!.shots[0]!.takes[0]!.screenplayHash).toBe(
      OLD_HASH,
    );

    const result = await applyAcknowledgeTake({
      project,
      sceneSlug: "s01-open",
      shotId: "01",
      takeId: "t01",
      dataDir,
      saveSceneShots,
      createProject,
    });

    // In-memory.
    expect(result.project.scenes[0]!.shots[0]!.takes[0]!.screenplayHash).toBe(
      NEW_HASH,
    );

    // YAML persisted.
    const reloaded = await loadProject(dataDir);
    expect(reloaded.scenes[0]!.shots[0]!.takes[0]!.screenplayHash).toBe(
      NEW_HASH,
    );
  });

  it("preserves Take.videoPath, createdAt, isStarred on disk", async () => {
    writeScene({
      slug: "s01-open",
      screenplay: `<!-- shot:01 -->\n${NEW_BODY}\n<!-- /shot:01 -->\n`,
      shotHash: NEW_HASH,
      takeHash: OLD_HASH,
    });
    const project = await loadProject(dataDir);

    await applyAcknowledgeTake({
      project,
      sceneSlug: "s01-open",
      shotId: "01",
      takeId: "t01",
      dataDir,
      saveSceneShots,
      createProject,
    });

    const reloaded = await loadProject(dataDir);
    const take = reloaded.scenes[0]!.shots[0]!.takes[0]!;
    expect(take.id).toBe("t01");
    expect(take.videoPath).toBe("takes/s01/01-take01.mp4");
    expect(take.createdAt).toBe("2026-06-01T00:00:00.000Z");
    expect(take.isStarred).toBe(true);
  });

  it("leaves Shot.screenplayHash untouched", async () => {
    writeScene({
      slug: "s01-open",
      screenplay: `<!-- shot:01 -->\n${NEW_BODY}\n<!-- /shot:01 -->\n`,
      shotHash: "shot-pinned-hash",
      takeHash: OLD_HASH,
    });
    const project = await loadProject(dataDir);

    await applyAcknowledgeTake({
      project,
      sceneSlug: "s01-open",
      shotId: "01",
      takeId: "t01",
      dataDir,
      saveSceneShots,
      createProject,
    });

    const reloaded = await loadProject(dataDir);
    expect(reloaded.scenes[0]!.shots[0]!.screenplayHash).toBe(
      "shot-pinned-hash",
    );
    expect(reloaded.scenes[0]!.shots[0]!.takes[0]!.screenplayHash).toBe(
      NEW_HASH,
    );
  });
});

describe("applyAcknowledgeTake — validation", () => {
  it("rejects unknown Scene", async () => {
    writeScene({
      slug: "s01-open",
      screenplay: `<!-- shot:01 -->\n${NEW_BODY}\n<!-- /shot:01 -->\n`,
      shotHash: NEW_HASH,
      takeHash: OLD_HASH,
    });
    const project = await loadProject(dataDir);
    await expect(
      applyAcknowledgeTake({
        project,
        sceneSlug: "ghost",
        shotId: "01",
        takeId: "t01",
        dataDir,
        saveSceneShots,
        createProject,
      }),
    ).rejects.toThrow(AcknowledgeError);
  });

  it("rejects unknown Shot", async () => {
    writeScene({
      slug: "s01-open",
      screenplay: `<!-- shot:01 -->\n${NEW_BODY}\n<!-- /shot:01 -->\n`,
      shotHash: NEW_HASH,
      takeHash: OLD_HASH,
    });
    const project = await loadProject(dataDir);
    await expect(
      applyAcknowledgeTake({
        project,
        sceneSlug: "s01-open",
        shotId: "99",
        takeId: "t01",
        dataDir,
        saveSceneShots,
        createProject,
      }),
    ).rejects.toThrow(AcknowledgeError);
  });

  it("rejects unknown Take", async () => {
    writeScene({
      slug: "s01-open",
      screenplay: `<!-- shot:01 -->\n${NEW_BODY}\n<!-- /shot:01 -->\n`,
      shotHash: NEW_HASH,
      takeHash: OLD_HASH,
    });
    const project = await loadProject(dataDir);
    await expect(
      applyAcknowledgeTake({
        project,
        sceneSlug: "s01-open",
        shotId: "01",
        takeId: "ghost",
        dataDir,
        saveSceneShots,
        createProject,
      }),
    ).rejects.toThrow(AcknowledgeError);
  });

  it("rejects acknowledge of Take whose Shot is orphan", async () => {
    writeScene({
      slug: "s01-open",
      screenplay: `# scene\nno markers here\n`,
      shotHash: OLD_HASH,
      takeHash: OLD_HASH,
    });
    const project = await loadProject(dataDir);
    await expect(
      applyAcknowledgeTake({
        project,
        sceneSlug: "s01-open",
        shotId: "01",
        takeId: "t01",
        dataDir,
        saveSceneShots,
        createProject,
      }),
    ).rejects.toThrow(AcknowledgeError);
  });
});
