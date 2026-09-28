/*
 * bundle() below follows HyperFrames' own CLI studio server:
 *   packages/cli/src/server/studioServer.ts (lines 477-492, v0.8.81)
 * https://github.com/heygen-com/hyperframes
 * Copyright 2026 HeyGen, Inc. Licensed under the Apache License, Version 2.0.
 * See ../LICENSE.hyperframes.
 */
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Hono } from "hono";
import {
  createStudioApi,
  createProjectSignature,
  historyCache,
  openProjectHistory,
  DEFAULT_HISTORY_ROOT,
  PREVIEW_BUNDLE_OPTIONS,
  type StudioApiAdapter,
  type ResolvedProject,
} from "@hyperframes/studio-server";
import { bundleToSingleHtml } from "@hyperframes/core/compiler";
import { videoClipThumbnail } from "./videoThumbnail.js";

/** What the CLI knows about a project — just its directory on disk. */
export interface HyperframesProjectRef {
  root: string;
}

/**
 * Where the studio sub-app is mounted in `apps/cli/src/index.ts`
 * (`app.route("/api", createHyperframesStudioApi(...))`). `bundle()` below
 * needs this as an absolute path baked into the served HTML, and
 * `runtimeUrl` is handed to Studio's client the same way.
 */
const RUNTIME_URL = "/api/runtime.js";

const require = createRequire(import.meta.url);

let runtimeSourcePromise: Promise<string | null> | null = null;

/**
 * The HyperFrames playback runtime, loaded once and served at `/api/runtime.js`.
 * Studio's bundled preview HTML references this URL instead of inlining the
 * ~150 KB runtime body on every request (see `bundle` below).
 */
function loadRuntimeSource(): Promise<string | null> {
  runtimeSourcePromise ??= (async () => {
    try {
      const runtimePath = require.resolve("@hyperframes/core/runtime");
      return await readFile(runtimePath, "utf-8");
    } catch (err) {
      console.error("[adapter-hyperframes] failed to load runtime:", err);
      return null;
    }
  })();
  return runtimeSourcePromise;
}

/**
 * Build the `StudioApiAdapter` that wires `@hyperframes/studio-server`'s
 * shared routes to artefact-editor's already-loaded projects, and mount them
 * (plus a `GET /runtime.js`) as a standalone Hono app.
 *
 * `projects` is a live view of artefact-editor's own project map — the same
 * one `apps/cli/src/index.ts` loads from each project's `manifest.json` — so
 * a project that exists to artefact-editor exists here under the same id.
 */
export function createHyperframesStudioApi(projects: Map<string, HyperframesProjectRef>): Hono {
  function resolveProject(id: string): ResolvedProject | null {
    const ref = projects.get(id);
    if (!ref) return null;
    return { id, dir: ref.root, title: id };
  }

  // One history per project directory, opened lazily on first request so a
  // project that never touches history (undo/redo, the History panel) never
  // creates a `~/.cache/hyperframes/history/<id>` folder for it. A history
  // that fails to open (e.g. another process holds it) is forgotten so the
  // next request tries again rather than sticking with a null forever.
  const histories = historyCache((projectDir) =>
    openProjectHistory({ projectDir, historyRoot: DEFAULT_HISTORY_ROOT }).catch((err) => {
      console.warn(`[adapter-hyperframes] history unavailable for ${projectDir}: ${String(err)}`);
      histories.forget(projectDir);
      return null;
    }),
  );

  const adapter: StudioApiAdapter = {
    listProjects: () =>
      Array.from(projects.entries()).map(([id, ref]) => ({ id, dir: ref.root, title: id })),

    resolveProject,

    history: (project) => histories.get(project.dir),

    // Mirrors hyperframes' own CLI studio server
    // (packages/cli/src/server/studioServer.ts:477-492): bundle the project
    // with an empty runtime `src=""` placeholder, then point it at our own
    // `/api/runtime.js` instead of inlining the runtime body on every preview.
    async bundle(dir, options) {
      try {
        const html = await bundleToSingleHtml(dir, { ...PREVIEW_BUNDLE_OPTIONS, ...options });
        return html.replace(
          'data-hyperframes-preview-runtime="1" src=""',
          `data-hyperframes-preview-runtime="1" src="${RUNTIME_URL}"`,
        );
      } catch (err) {
        console.error("[adapter-hyperframes] bundle failed:", err);
        return null;
      }
    },

    getProjectSignature: createProjectSignature,

    // artefact-editor doesn't surface Studio's lint findings anywhere yet;
    // an empty result keeps the route answering without pulling in
    // @hyperframes/lint as a dependency.
    lint: () => ({ findings: [] }),

    runtimeUrl: RUNTIME_URL,

    // Video clips only, via ffmpeg (see videoThumbnail.ts); no headless browser.
    generateThumbnail: (opts) =>
      videoClipThumbnail({
        projectDir: opts.project.dir,
        compPath: opts.compPath,
        selector: opts.selector,
        seekTime: opts.seekTime,
        outputWidth: opts.outputWidth,
        outputHeight: opts.outputHeight,
        format: opts.format,
        signal: opts.signal,
      }),

    rendersDir: (project) => join(project.dir, "renders"),

    // Rendering stays on artefact-editor's own route
    // (`POST /api/projects/:id/render` → `renderHyperframes()` in
    // apps/cli/src/index.ts), mounted before this sub-app so it always wins.
    // This is unreachable in practice; it exists only to satisfy
    // `StudioApiAdapter`'s required `startRender`.
    startRender() {
      throw new Error("Rendering goes through POST /api/projects/:id/render, not the studio API.");
    },
  };

  const api = new Hono();

  api.get("/runtime.js", async (c) => {
    const source = await loadRuntimeSource();
    if (!source) return c.text("runtime not available", 404);
    return c.body(source, 200, {
      "Content-Type": "text/javascript",
      "Cache-Control": "no-store",
    });
  });

  api.route("/", createStudioApi(adapter));

  return api;
}
