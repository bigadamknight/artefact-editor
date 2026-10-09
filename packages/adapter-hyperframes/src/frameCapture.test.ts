import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cp, mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve, type ServerType } from "@hono/node-server";
import { Hono } from "hono";
import sharp from "sharp";
import { resolveChromeExecutable } from "./chromeExecutable";
import { captureFrames, closeFrameCapture, type FrameCaptureRequest } from "./frameCapture";
import { createHyperframesStudioApi } from "./studioApi";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const fixtureDir = join(repoRoot, "examples", "hyperframes-timeline-sample");
const chrome = await resolveChromeExecutable();

describe.skipIf(!chrome)("captureFrames (headless Chrome)", () => {
  let dir: string;
  let server: ServerType;
  let previewUrl: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "ae-frame-capture-"));
    await cp(fixtureDir, dir, { recursive: true });
    const app = new Hono();
    app.route("/api", createHyperframesStudioApi(new Map([["sample", { root: dir }]])));
    server = await new Promise<ServerType>((done) => {
      const s = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, () => done(s));
    });
    const { port } = server.address() as AddressInfo;
    previewUrl = `http://127.0.0.1:${port}/api/projects/sample/preview`;
  });

  afterAll(async () => {
    await closeFrameCapture();
    await new Promise<void>((done) => server?.close(() => done()));
    await rm(dir, { recursive: true, force: true });
  });

  const request = (overrides: Partial<FrameCaptureRequest>): FrameCaptureRequest => ({
    previewUrl,
    version: "v1",
    times: [1],
    fps: 24,
    width: 1620,
    height: 1080,
    deviceScaleFactor: 1,
    format: "png",
    signal: new AbortController().signal,
    ...overrides,
  });

  it("captures the full composition at scale 1", async () => {
    const [frame] = await captureFrames(request({}));
    const meta = await sharp(frame!).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["png", 1620, 1080]);
  }, 60_000);

  it("captures byte-identical frames for the same time", async () => {
    const [a] = await captureFrames(request({ times: [1] }));
    const [b] = await captureFrames(request({ times: [1] }));
    expect(a!.equals(b!)).toBe(true);
  }, 60_000);

  it("clips to a selector", async () => {
    // #captions hosts a full-frame sub-composition, so its clip is the whole
    // frame; #captions-band (inside it) is the 1296x200 caption box.
    const [host] = await captureFrames(request({ selector: "#captions" }));
    expect((await sharp(host!).metadata()).format).toBe("png");
    const [band] = await captureFrames(request({ selector: "#captions-band" }));
    const meta = await sharp(band!).metadata();
    expect(meta.width).toBeLessThan(1620);
    expect(meta.height).toBeLessThan(1080);
  }, 60_000);

  it("captures a backward seek after a forward one", async () => {
    const [late] = await captureFrames(request({ times: [6] }));
    const [early] = await captureFrames(request({ times: [0.5] }));
    for (const frame of [late, early]) {
      const meta = await sharp(frame!).metadata();
      expect([meta.format, meta.width, meta.height]).toEqual(["png", 1620, 1080]);
    }
  }, 60_000);

  it("returns frames in request order and rejects an aborted request", async () => {
    const frames = await captureFrames(request({ times: [2, 1], deviceScaleFactor: 0.25 }));
    expect(frames).toHaveLength(2);
    expect(frames.every((f) => f !== null)).toBe(true);
    const aborted = new AbortController();
    aborted.abort();
    await expect(captureFrames(request({ signal: aborted.signal }))).rejects.toThrow(/abort/i);
  }, 60_000);
});
