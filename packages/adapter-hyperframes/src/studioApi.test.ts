import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, cp, rm, readFile, mkdir } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve, type ServerType } from "@hono/node-server";
import { Hono } from "hono";
import { DEFAULT_HISTORY_ROOT } from "@hyperframes/studio-server";
import { createHyperframesStudioApi } from "./studioApi.js";
import { resolveChromeExecutable } from "./chromeExecutable.js";
import { closeFrameCapture } from "./frameCapture.js";

// Lets a test pretend no Chrome is installed; otherwise the real lookup runs.
const chromeLookup = vi.hoisted(() => ({ unavailable: false }));
vi.mock("./chromeExecutable.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./chromeExecutable.js")>();
  return {
    ...actual,
    resolveChromeExecutable: () =>
      chromeLookup.unavailable ? Promise.resolve(null) : actual.resolveChromeExecutable(),
  };
});

// packages/adapter-hyperframes/src -> packages/adapter-hyperframes -> packages -> repo
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const fixtureDir = join(repoRoot, "examples", "hyperframes-timeline-sample");

const PROJECT_ID = "sample";

interface FileResponse {
  filename: string;
  content: string;
  version: string;
  missing: boolean;
}

interface PutResponse {
  ok: boolean;
  path?: string;
  version?: string;
  error?: string;
}

/**
 * `openProjectHistory` records which `~/.cache/hyperframes/history/<uuid>`
 * folder belongs to a project in that project's own `.hyperframes/history-id`
 * — read it before the temp project is removed so the (real, global) history
 * cache doesn't accumulate one orphaned folder per test run.
 */
async function cleanupHistoryFor(projectDir: string): Promise<void> {
  try {
    const id = (await readFile(join(projectDir, ".hyperframes", "history-id"), "utf-8")).trim();
    if (id) await rm(join(DEFAULT_HISTORY_ROOT, id), { recursive: true, force: true });
  } catch {
    // History was never opened for this project (or already cleaned up).
  }
}

describe("createHyperframesStudioApi", () => {
  let tempDir: string;
  let api: ReturnType<typeof createHyperframesStudioApi>;

  // Every test gets its own filesystem copy of the fixture project — the
  // studio API writes real files (and, for history, a real
  // ~/.cache/hyperframes/history/<uuid> folder), so tests must never share
  // the checked-in examples/hyperframes-timeline-sample/ directory itself.
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "hf-adapter-test-"));
    await cp(fixtureDir, tempDir, { recursive: true });
    api = createHyperframesStudioApi(new Map([[PROJECT_ID, { root: tempDir }]]));
  });

  afterEach(async () => {
    await cleanupHistoryFor(tempDir);
    await rm(tempDir, { recursive: true, force: true });
  });

  it("GET a project file returns its content and a version", async () => {
    const res = await api.request(`/projects/${PROJECT_ID}/files/index.html`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as FileResponse;
    expect(body.missing).toBe(false);
    expect(typeof body.version).toBe("string");
    expect(body.version.length).toBeGreaterThan(0);
    expect(body.content).toContain('id="lion-close"');
  });

  it("PUT with a matching If-Match changes data-start on the target clip", async () => {
    const before = await api.request(`/projects/${PROJECT_ID}/files/index.html`);
    const { content, version } = (await before.json()) as FileResponse;
    expect(content).toContain('data-hf-id="hf-tx6s"');

    const updated = content.replace(
      /(<video data-hf-id="hf-tx6s"[^>]*data-start=")4\.24(")/,
      "$15.24$2",
    );
    expect(updated).not.toBe(content);

    const putRes = await api.request(`/projects/${PROJECT_ID}/files/index.html`, {
      method: "PUT",
      headers: { "If-Match": version, "Content-Type": "text/html" },
      body: updated,
    });
    expect(putRes.status).toBe(200);
    const putBody = (await putRes.json()) as PutResponse;
    expect(putBody.ok).toBe(true);
    expect(putBody.version).not.toBe(version);

    const after = await api.request(`/projects/${PROJECT_ID}/files/index.html`);
    const afterBody = (await after.json()) as FileResponse;
    expect(afterBody.content).toContain('data-start="5.24"');
    expect(afterBody.content).not.toContain('data-start="4.24"');
  });

  it("PUT with a stale If-Match is rejected with 409, not applied", async () => {
    const before = await api.request(`/projects/${PROJECT_ID}/files/index.html`);
    const { content: original, version: originalVersion } = (await before.json()) as FileResponse;

    // Land one real write so `originalVersion` no longer matches disk.
    const firstPut = await api.request(`/projects/${PROJECT_ID}/files/index.html`, {
      method: "PUT",
      headers: { "If-Match": originalVersion, "Content-Type": "text/html" },
      body: original.replace('data-start="4.24"', 'data-start="5.24"'),
    });
    expect(firstPut.status).toBe(200);

    // Retry against the now-stale version.
    const secondPut = await api.request(`/projects/${PROJECT_ID}/files/index.html`, {
      method: "PUT",
      headers: { "If-Match": originalVersion, "Content-Type": "text/html" },
      body: original.replace('data-start="4.24"', 'data-start="6.24"'),
    });
    expect(secondPut.status).toBe(409);
    const conflictBody = (await secondPut.json()) as PutResponse;
    expect(conflictBody.error).toBe("file conflict");

    // The second (rejected) write must not have landed.
    const after = await api.request(`/projects/${PROJECT_ID}/files/index.html`);
    const afterBody = (await after.json()) as FileResponse;
    expect(afterBody.content).not.toContain('data-start="6.24"');
  });

  it("a history step (undo) restores the file to what it was before the edit", async () => {
    const before = await api.request(`/projects/${PROJECT_ID}/files/index.html`);
    const { content: original, version } = (await before.json()) as FileResponse;

    const windowRes = await api.request(`/projects/${PROJECT_ID}/history/window`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "test edit" }),
    });
    expect(windowRes.status).toBe(200);
    const { windowId } = (await windowRes.json()) as { windowId: string };

    const putRes = await api.request(`/projects/${PROJECT_ID}/files/index.html`, {
      method: "PUT",
      headers: { "If-Match": version, "Content-Type": "text/html" },
      body: original.replace('data-start="4.24"', 'data-start="5.24"'),
    });
    expect(putRes.status).toBe(200);

    const closeRes = await api.request(
      `/projects/${PROJECT_ID}/history/window/${windowId}/close`,
      { method: "POST" },
    );
    expect(closeRes.status).toBe(200);
    const closeBody = (await closeRes.json()) as {
      entry: { files: Array<{ path: string }> } | null;
    };
    expect(closeBody.entry).not.toBeNull();
    expect(closeBody.entry?.files.some((f) => f.path === "index.html")).toBe(true);

    const stepRes = await api.request(`/projects/${PROJECT_ID}/history/step`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction: "back" }),
    });
    expect(stepRes.status).toBe(200);
    const stepBody = (await stepRes.json()) as { ok: boolean };
    expect(stepBody.ok).toBe(true);

    const after = await api.request(`/projects/${PROJECT_ID}/files/index.html`);
    const afterBody = (await after.json()) as FileResponse;
    expect(afterBody.content).toBe(original);
  });
});

const hasChrome = await resolveChromeExecutable().then(Boolean);

describe("thumbnails and review routes over HTTP", () => {
  let tempDir: string;
  let server: ServerType;
  let base: string;

  // Served over a real port: studio-server builds the preview URL Chrome
  // loads from the request's host header.
  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "hf-adapter-http-"));
    await cp(fixtureDir, tempDir, { recursive: true });
    // The sample's media is not checked in; a short test clip stands in for #lion-close.
    await mkdir(join(tempDir, "assets"), { recursive: true });
    execFileSync("ffmpeg", [
      "-v", "error", "-f", "lavfi", "-i", "testsrc=duration=3:size=162x108:rate=24",
      "-pix_fmt", "yuv420p", join(tempDir, "assets", "closeup_lion.mp4"),
    ]);
    const app = new Hono();
    app.route("/api", createHyperframesStudioApi(new Map([[PROJECT_ID, { root: tempDir }]])));
    server = await new Promise<ServerType>((done) => {
      const s = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, () => done(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/projects/${PROJECT_ID}`;
  });

  afterAll(async () => {
    chromeLookup.unavailable = false;
    await closeFrameCapture();
    await new Promise<void>((done) => server?.close(() => done()));
    await rm(tempDir, { recursive: true, force: true });
  });

  it.skipIf(!hasChrome)("renders an HTML clip thumbnail in headless Chrome", async () => {
    const res = await fetch(`${base}/thumbnail/index.html?t=1&selector=%23captions&w=1620&h=1080`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.subarray(0, 2).toString("hex")).toBe("ffd8");
  }, 60_000);

  it("mounts the review routes ahead of studio-server's", async () => {
    const res = await fetch(`${base}/scenes`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { scenes: Array<{ id: string }> };
    expect(body.scenes.map((s) => s.id)).toContain("captions");
  });

  it("serves video clip thumbnails, and answers 503 on review images, without Chrome", async () => {
    await closeFrameCapture();
    chromeLookup.unavailable = true;
    const video = await fetch(`${base}/thumbnail/index.html?t=5&selector=%23lion-close&w=1620&h=1080`);
    expect(video.status).toBe(200);
    expect(video.headers.get("content-type")).toBe("image/jpeg");

    const onion = await fetch(`${base}/onion?from=0&to=1&n=3`);
    expect(onion.status).toBe(503);
    expect(((await onion.json()) as { hint: string }).hint).toContain("HYPERFRAMES_BROWSER_PATH");
  });
});
