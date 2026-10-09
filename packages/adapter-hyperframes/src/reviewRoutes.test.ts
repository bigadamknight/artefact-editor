import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendFile, cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import sharp from "sharp";
import { ChromeUnavailableError, type FrameCaptureRequest } from "./frameCapture";
import { previewUrlFor, registerReviewRoutes } from "./reviewRoutes";
import type { SceneList } from "./scenes";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const fixtureDir = join(repoRoot, "examples", "hyperframes-timeline-sample");

let sampleDir: string;
let plainDir: string;
let calls: FrameCaptureRequest[];
let failWith: Error | null;
let dropFrame: number | null;

/** Stands in for headless Chrome: one solid frame per requested time, at the requested scale. */
async function fakeCapture(req: FrameCaptureRequest): Promise<(Buffer | null)[]> {
  calls.push(req);
  if (failWith) throw failWith;
  const width = Math.round(req.width * req.deviceScaleFactor);
  const height = Math.round(req.height * req.deviceScaleFactor);
  return Promise.all(
    req.times.map((_, i) =>
      i === dropFrame
        ? null
        : sharp({ create: { width, height, channels: 3, background: { r: 40 * i, g: 80, b: 120 } } })
            .png()
            .toBuffer(),
    ),
  );
}

function api(): Hono {
  const projects: Record<string, string> = { sample: sampleDir, plain: plainDir };
  const app = new Hono();
  registerReviewRoutes(app, {
    resolveProject: (id) => (projects[id] ? { id, dir: projects[id] } : null),
    capture: fakeCapture,
    previewUrlFor,
  });
  return app;
}

beforeEach(async () => {
  calls = [];
  failWith = null;
  dropFrame = null;
  sampleDir = await mkdtemp(join(tmpdir(), "ae-review-sample-"));
  await cp(fixtureDir, sampleDir, { recursive: true });
  plainDir = await mkdtemp(join(tmpdir(), "ae-review-plain-"));
  await writeFile(
    join(plainDir, "index.html"),
    `<div id="stage" data-composition-id="master" data-width="1920" data-height="1080" data-duration="36.5">
      <audio id="vo" src="vo.mp3" data-start="0" data-duration="4"></audio>
      <div class="scene s1">One</div><div class="scene s2">Two</div>
    </div>`,
  );
});

afterEach(async () => {
  await rm(sampleDir, { recursive: true, force: true });
  await rm(plainDir, { recursive: true, force: true });
});

describe("GET /projects/:id/scenes", () => {
  it("lists the captions sub-composition", async () => {
    const res = await api().request("/projects/sample/scenes");
    expect(res.status).toBe(200);
    const body = (await res.json()) as SceneList;
    expect(body).toMatchObject({ comp: "index.html", fps: 24, duration: 14.52, width: 1620, height: 1080 });
    const captions = body.scenes.find((s) => s.id === "captions");
    expect(captions).toMatchObject({
      start: 0,
      duration: 14.52,
      kind: "composition",
      selector: "#captions",
      comp: "compositions/captions.html",
    });
    expect(body.scenes.find((s) => s.id === "lion-close")?.kind).toBe("video");
    expect(body.scenes.some((s) => s.id === "fairy-voice")).toBe(false);
  });

  it("returns one synthetic root scene when nothing is timed", async () => {
    const body = (await (await api().request("/projects/plain/scenes")).json()) as SceneList;
    expect(body).toMatchObject({ fps: 30, duration: 36.5, width: 1920, height: 1080 });
    expect(body.scenes).toEqual([
      { id: "root", label: "master", start: 0, duration: 36.5, selector: "", kind: "root", comp: "index.html" },
    ]);
  });

  it("gives a sub-composition the duration of the clip that mounts it", async () => {
    const body = (await (await api().request("/projects/sample/scenes?comp=compositions/captions.html")).json()) as SceneList;
    expect(body.duration).toBe(14.52);
  });

  it("answers 404 for an unknown project or composition", async () => {
    expect((await api().request("/projects/nope/scenes")).status).toBe(404);
    expect((await api().request("/projects/sample/scenes?comp=missing.html")).status).toBe(404);
    expect((await api().request("/projects/sample/scenes?comp=../../etc/passwd.html")).status).toBe(404);
  });
});

describe("GET /projects/:id/onion", () => {
  it("returns a PNG at half scale with an ETag", async () => {
    const res = await api().request("/projects/plain/onion?from=0.2&to=1.2&n=6");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("etag")).toMatch(/^"[0-9a-f]{40}"$/);
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect([meta.width, meta.height]).toEqual([960, 540]);
    expect(calls[0]?.times).toEqual([0.2, 0.4, 0.6, 0.8, 1, 1.2]);
    expect(calls[0]?.previewUrl).toBe("http://localhost/api/projects/plain/preview");
  });

  it("clamps n to 24", async () => {
    const res = await api().request("/projects/plain/onion?from=0&to=2&n=99");
    expect(res.status).toBe(200);
    expect(calls[0]?.times).toHaveLength(24);
  });

  it("rejects an empty or reversed range with 400", async () => {
    for (const query of ["from=2&to=1", "from=1&to=1", "from=x&to=1", "scene=nope"]) {
      const res = await api().request(`/projects/plain/onion?${query}`);
      expect(res.status, query).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBeTruthy();
    }
    expect(calls).toHaveLength(0);
  });

  it("answers 404 for an unknown composition", async () => {
    expect((await api().request("/projects/sample/onion?comp=nope.html")).status).toBe(404);
  });

  it("answers 503 with an install hint when Chrome is unavailable", async () => {
    failWith = new ChromeUnavailableError();
    const res = await api().request("/projects/plain/onion?from=0&to=1");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "headless Chrome not found",
      hint: "npx @puppeteer/browsers install chrome-headless-shell, or set HYPERFRAMES_BROWSER_PATH",
    });
  });

  it("answers 304 to a matching If-None-Match, and a source edit changes the ETag", async () => {
    const app = api();
    const url = "/projects/sample/onion?from=0.2&to=1.2&n=6";
    const first = await app.request(url);
    const etag = first.headers.get("etag")!;
    const again = await app.request(url, { headers: { "If-None-Match": etag } });
    expect(again.status).toBe(304);
    expect(again.headers.get("etag")).toBe(etag);

    // The second plain request is served from .thumbnails without capturing.
    expect((await app.request(url)).status).toBe(200);
    expect(calls).toHaveLength(1);

    await appendFile(join(sampleDir, "index.html"), "\n<!-- edited -->\n");
    const edited = await app.request(url, { headers: { "If-None-Match": etag } });
    expect(edited.status).toBe(200);
    expect(edited.headers.get("etag")).not.toBe(etag);
  });

  it("leaves the revision parameter out of the cache key and ETag", async () => {
    const app = api();
    const first = await app.request("/projects/plain/onion?from=0.2&to=1.2&n=6&revision=1");
    const etag = first.headers.get("etag")!;
    const bumped = await app.request("/projects/plain/onion?from=0.2&to=1.2&n=6&revision=2", {
      headers: { "If-None-Match": etag },
    });
    expect(bumped.status).toBe(304);
    const plain = await app.request("/projects/plain/onion?from=0.2&to=1.2&n=6");
    expect(plain.status).toBe(200);
    expect(plain.headers.get("etag")).toBe(etag);
    expect(calls).toHaveLength(1);
  });

  it("does not cache an image that is missing a frame", async () => {
    const app = api();
    const url = "/projects/plain/onion?from=0.2&to=1.2&n=6";
    dropFrame = 2;
    expect((await app.request(url)).status).toBe(200);
    dropFrame = null;
    expect((await app.request(url)).status).toBe(200);
    expect((await app.request(url)).status).toBe(200);
    // The partial first image was not cached; the complete second one was.
    expect(calls).toHaveLength(2);
  });

  it("uses a scene's span and passes the selector through", async () => {
    await api().request("/projects/sample/onion?scene=lion-close&n=2&selector=%23captions&selectorIndex=0");
    expect(calls[0]).toMatchObject({ times: [4.24, 6.68], selector: "#captions", selectorIndex: 0, fps: 24 });
  });
});

describe("GET /projects/:id/strip", () => {
  it("lays out columns × width plus gutters", async () => {
    const res = await api().request("/projects/plain/strip?n=12&columns=4&width=480");
    expect(res.status).toBe(200);
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect(meta.width).toBe(4 * 480 + 5 * 8);
    expect(calls[0]?.times).toHaveLength(12);
    expect(calls[0]?.deviceScaleFactor).toBe(0.25);
  });
});

describe("GET /projects/:id/frame", () => {
  it("returns one frame in the requested format", async () => {
    const res = await api().request("/projects/plain/frame?t=1.5&scale=0.5&format=jpeg");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(calls[0]).toMatchObject({ times: [1.5], deviceScaleFactor: 0.5, format: "jpeg" });
    expect((await api().request("/projects/plain/frame?format=gif")).status).toBe(400);
  });
});

describe("previewUrlFor", () => {
  it("mirrors studio-server's preview URLs and falls back to localhost", () => {
    expect(previewUrlFor("127.0.0.1:7411", "p", "index.html")).toBe("http://127.0.0.1:7411/api/projects/p/preview");
    expect(previewUrlFor(undefined, "p", "compositions/a b.html")).toBe(
      "http://localhost/api/projects/p/preview/comp/compositions/a%20b.html",
    );
  });
});
