import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { Context, Hono } from "hono";
import sharp from "sharp";
import { createProjectSignature, type ResolvedProject } from "@hyperframes/studio-server";
import { ChromeUnavailableError, type FrameCaptureRequest } from "./frameCapture.js";
import { composeContactSheet, composeOnion } from "./reviewImages.js";
import { listScenes, resolveRange, type Scene, type SceneList } from "./scenes.js";

/**
 * Agent-facing review routes, mounted inside the adapter's `/api` app:
 *
 *   GET /projects/:id/scenes  JSON list of the composition's timed scenes
 *   GET /projects/:id/frame   one captured frame
 *   GET /projects/:id/onion   frames across a range blended into one PNG
 *   GET /projects/:id/strip   frames across a range as a labelled contact sheet
 *
 * Images are cached in `<project>/.thumbnails/review-<key>.<ext>` (the
 * directory studio-server's thumbnail route already prunes) and carry an
 * ETag, so a repeated request with `If-None-Match` answers 304.
 */
export interface ReviewRouteDeps {
  resolveProject: (id: string) => ResolvedProject | null | Promise<ResolvedProject | null>;
  capture: (req: FrameCaptureRequest) => Promise<(Buffer | null)[]>;
  previewUrlFor: (host: string | undefined, projectId: string, comp: string) => string;
}

const CHROME_HINT = "npx @puppeteer/browsers install chrome-headless-shell, or set HYPERFRAMES_BROWSER_PATH";

/**
 * The studio preview URL headless Chrome loads, as studio-server's own
 * thumbnail route builds it. Without a host header (in-process requests in
 * tests) it falls back to `localhost`.
 */
export function previewUrlFor(host: string | undefined, projectId: string, comp: string): string {
  const base = `http://${host || "localhost"}/api/projects/${encodeURIComponent(projectId)}/preview`;
  return comp === "index.html" ? base : `${base}/comp/${comp.split("/").map(encodeURIComponent).join("/")}`;
}

class BadRequest extends Error {}

function numberParam(
  c: Context,
  name: string,
  opts: { fallback: number; min: number; max: number; integer?: boolean },
): number {
  const raw = c.req.query(name);
  if (raw === undefined || raw === "") return opts.fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new BadRequest(`${name} must be a number`);
  const n = opts.integer ? Math.round(value) : value;
  return Math.min(opts.max, Math.max(opts.min, n));
}

function optionalNumber(c: Context, name: string): number | undefined {
  const raw = c.req.query(name);
  if (raw === undefined || raw === "") return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new BadRequest(`${name} must be a number`);
  return value;
}

/** A composition path inside the project, or null. */
function resolveComp(projectDir: string, comp: string): string | null {
  if (!/\.html?$/i.test(comp)) return null;
  const file = resolve(projectDir, comp);
  const rel = relative(resolve(projectDir), file);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return null;
  try {
    return statSync(file).isFile() ? file : null;
  } catch {
    return null;
  }
}

interface ReviewTarget {
  project: ResolvedProject;
  comp: string;
  list: SceneList;
  selector?: string;
  selectorIndex?: number;
}

async function resolveTarget(c: Context, deps: ReviewRouteDeps): Promise<ReviewTarget | Response> {
  const project = await deps.resolveProject(c.req.param("id") ?? "");
  if (!project) return c.json({ error: "project not found" }, 404);
  const comp = c.req.query("comp") || "index.html";
  if (!resolveComp(project.dir, comp)) return c.json({ error: `composition not found: ${comp}` }, 404);
  const list = await listScenes(project.dir, comp);
  if (!list) return c.json({ error: `composition not found: ${comp}` }, 404);
  const selector = c.req.query("selector") || undefined;
  const selectorIndex = optionalNumber(c, "selectorIndex");
  if (selectorIndex !== undefined && (selectorIndex < 0 || !Number.isInteger(selectorIndex))) {
    throw new BadRequest("selectorIndex must be a non-negative integer");
  }
  return { project, comp, list, selector, selectorIndex };
}

/** The range for onion/strip from `scene=` or `from=&to=`, plus the scene it came from. */
function rangeFor(c: Context, list: SceneList): { from: number; to: number; scene?: Scene } {
  const scene = c.req.query("scene") || undefined;
  const range = resolveRange(list.scenes, {
    scene,
    from: optionalNumber(c, "from"),
    to: optionalNumber(c, "to"),
    duration: list.duration,
  });
  if ("error" in range) throw new BadRequest(range.error);
  return { ...range, scene: list.scenes.find((s) => s.id === scene) };
}

/**
 * Query parameters that do not change the image. The timeline appends
 * `revision` only to bust the browser's cache; the project signature already
 * covers the edit it stands for.
 */
const IGNORED_FOR_CACHE = new Set(["revision"]);

function cacheKey(target: ReviewTarget, route: string, url: URL, signature: string): string {
  const query = [...url.searchParams.entries()]
    .filter(([k]) => !IGNORED_FOR_CACHE.has(k))
    .sort(([a, av], [b, bv]) => a.localeCompare(b) || av.localeCompare(bv))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return createHash("sha1").update(`${signature}\0${target.comp}\0${route}\0${query}`).digest("hex");
}

function writeAtomically(path: string, data: Buffer): void {
  const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(tmp, data, { flag: "wx" });
    renameSync(tmp, path);
  } finally {
    rmSync(tmp, { force: true });
  }
}

/**
 * Answer from the ETag or the disk cache, or run `produce` and cache what it
 * returns. The cache is written only if every frame was captured and the
 * project did not change during capture: the key ignores `revision`, so a
 * cached partial image would outlive every refresh.
 */
async function cached(
  c: Context,
  target: ReviewTarget,
  route: string,
  format: "png" | "jpeg",
  produce: (signature: string) => Promise<{ image: Buffer; complete: boolean }>,
): Promise<Response> {
  const signature = createProjectSignature(target.project.dir);
  const key = cacheKey(target, route, new URL(c.req.url, "http://localhost"), signature);
  const etag = `"${key}"`;
  const headers = {
    "Content-Type": format === "png" ? "image/png" : "image/jpeg",
    "Cache-Control": "no-cache",
    ETag: etag,
  };
  if (c.req.header("If-None-Match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": "no-cache" } });
  }
  const cacheDir = join(target.project.dir, ".thumbnails");
  const file = join(cacheDir, `review-${key}.${format === "png" ? "png" : "jpg"}`);
  if (existsSync(file)) return new Response(new Uint8Array(readFileSync(file)), { headers });

  const { image, complete } = await produce(signature);
  if (complete && createProjectSignature(target.project.dir) === signature) {
    mkdirSync(cacheDir, { recursive: true });
    writeAtomically(file, image);
  }
  return new Response(new Uint8Array(image), { headers });
}

function errorResponse(c: Context, err: unknown): Response {
  if (err instanceof BadRequest) return c.json({ error: err.message }, 400);
  if (err instanceof ChromeUnavailableError) return c.json({ error: err.message, hint: CHROME_HINT }, 503);
  if (err instanceof DOMException && err.name === "AbortError") return new Response(null, { status: 499 });
  const message = err instanceof Error ? err.message : String(err);
  return c.json({ error: `capture failed: ${message}` }, 500);
}

const quantise = (t: number, fps: number) => Math.round(t * fps) / fps;
const roundMs = (t: number) => Math.round(t * 1000) / 1000;
const seconds = (t: number) => t.toFixed(2);

export function registerReviewRoutes(api: Hono, deps: ReviewRouteDeps): void {
  function captureRequest(
    c: Context,
    target: ReviewTarget,
    signature: string,
    times: number[],
    deviceScaleFactor: number,
    format: "png" | "jpeg",
  ): FrameCaptureRequest {
    return {
      previewUrl: deps.previewUrlFor(c.req.header("host"), target.project.id, target.comp),
      version: `${signature}:${target.comp}`,
      times,
      fps: target.list.fps,
      width: target.list.width,
      height: target.list.height,
      deviceScaleFactor,
      selector: target.selector,
      selectorIndex: target.selectorIndex,
      format,
      signal: c.req.raw.signal,
    };
  }

  api.get("/projects/:id/scenes", async (c) => {
    try {
      const target = await resolveTarget(c, deps);
      if (target instanceof Response) return target;
      return c.json(target.list);
    } catch (err) {
      return errorResponse(c, err);
    }
  });

  api.get("/projects/:id/frame", async (c) => {
    try {
      const target = await resolveTarget(c, deps);
      if (target instanceof Response) return target;
      const t = numberParam(c, "t", { fallback: 0, min: 0, max: target.list.duration });
      const scale = numberParam(c, "scale", { fallback: 1, min: 0.05, max: 1 });
      const rawFormat = c.req.query("format") ?? "png";
      if (rawFormat !== "png" && rawFormat !== "jpeg") throw new BadRequest("format must be png or jpeg");
      const format = rawFormat;
      return await cached(c, target, "frame", format, async (signature) => {
        const [frame] = await deps.capture(captureRequest(c, target, signature, [t], scale, format));
        if (!frame) throw new Error(`no frame at t=${t}`);
        return { image: frame, complete: true };
      });
    } catch (err) {
      return errorResponse(c, err);
    }
  });

  api.get("/projects/:id/onion", async (c) => {
    try {
      const target = await resolveTarget(c, deps);
      if (target instanceof Response) return target;
      const { from, to } = rangeFor(c, target.list);
      const n = numberParam(c, "n", { fallback: 6, min: 1, max: 24, integer: true });
      const scale = numberParam(c, "scale", { fallback: 0.5, min: 0.05, max: 1 });
      const times = Array.from({ length: n }, (_, i) => roundMs(n === 1 ? from : from + (i / (n - 1)) * (to - from)));
      return await cached(c, target, "onion", "png", async (signature) => {
        const captured = await deps.capture(captureRequest(c, target, signature, times, scale, "png"));
        const frames = captured.filter((f): f is Buffer => f !== null);
        const first = frames[0];
        if (!first) throw new Error("no frames captured");
        // A selector capture is the element's box, not the full composition.
        const meta = target.selector ? await sharp(first).metadata() : null;
        const image = await composeOnion(frames, {
          width: meta?.width ?? Math.round(target.list.width * scale),
          height: meta?.height ?? Math.round(target.list.height * scale),
          label: `onion · ${frames.length} frames · t ${seconds(from)}–${seconds(to)}s`,
        });
        return { image, complete: frames.length === times.length };
      });
    } catch (err) {
      return errorResponse(c, err);
    }
  });

  api.get("/projects/:id/strip", async (c) => {
    try {
      const target = await resolveTarget(c, deps);
      if (target instanceof Response) return target;
      const { from, to, scene } = rangeFor(c, target.list);
      const n = numberParam(c, "n", { fallback: 12, min: 1, max: 64, integer: true });
      const columns = numberParam(c, "columns", { fallback: Math.min(4, n), min: 1, max: 8, integer: true });
      const cellWidth = numberParam(c, "width", { fallback: 480, min: 120, max: 960, integer: true });
      // The middle of each of n equal slices, so no cell sits on the range's
      // end (where the next scene has already started).
      const times = Array.from({ length: n }, (_, i) => roundMs(from + ((i + 0.5) / n) * (to - from)));
      const scale = Math.min(2, cellWidth / target.list.width);
      return await cached(c, target, "strip", "png", async (signature) => {
        const frames = await deps.capture(captureRequest(c, target, signature, times, scale, "png"));
        const first = frames.find((f): f is Buffer => f !== null);
        if (!first) throw new Error("no frames captured");
        const meta = target.selector ? await sharp(first).metadata() : null;
        const aspect =
          meta?.width && meta.height ? meta.width / meta.height : target.list.width / target.list.height;
        const range = scene ? scene.label : `t ${seconds(from)}–${seconds(to)}s`;
        const image = await composeContactSheet(
          frames.map((frame, i) => ({ frame, label: `t=${seconds(quantise(times[i] ?? 0, target.list.fps))}s` })),
          { columns, cellWidth, aspect, title: `${target.project.id} · ${target.comp} · ${range}` },
        );
        return { image, complete: frames.every((f) => f !== null) };
      });
    } catch (err) {
      return errorResponse(c, err);
    }
  });
}
