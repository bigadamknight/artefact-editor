import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, cp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_HISTORY_ROOT } from "@hyperframes/studio-server";
import { createHyperframesStudioApi } from "./studioApi.js";

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
