/*
 * seekAndSettle() below follows the HyperFrames CLI's seek-and-settle sequence:
 *   seekCompositionTimeline() and waitForCompositionFonts() in the `hyperframes`
 *   CLI (dist/cli.js, v0.8.73), used by its studio server's generateThumbnail.
 * https://github.com/heygen-com/hyperframes
 * Copyright 2026 HeyGen, Inc. Licensed under the Apache License, Version 2.0.
 * See ../LICENSE.hyperframes.
 */
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { getElementScreenshotClip } from "@hyperframes/studio-server";
import { resolveChromeExecutable } from "./chromeExecutable.js";

/**
 * Server-side frame capture: one resident headless Chrome that loads a
 * project's studio preview URL, seeks the HyperFrames runtime and takes
 * screenshots. Timeline thumbnails (studioApi.ts) and the review images
 * (reviewRoutes.ts) both come through here.
 */
export interface FrameCaptureRequest {
  /** Absolute http URL of the studio preview (`/api/projects/:id/preview[/comp/<path>]`). */
  previewUrl: string;
  /** Page-pool key: project signature (plus comp path). A new value reloads the page. */
  version: string;
  /** Composition seconds. Captured in ascending order; results keep the input order. */
  times: number[];
  /** Each time is quantised to `Math.round(t * fps) / fps`. */
  fps: number;
  /** Composition size, used as the viewport. */
  width: number;
  height: number;
  deviceScaleFactor: number;
  selector?: string;
  selectorIndex?: number;
  format: "png" | "jpeg";
  signal: AbortSignal;
}

export class ChromeUnavailableError extends Error {
  constructor() {
    super("headless Chrome not found");
    this.name = "ChromeUnavailableError";
  }
}

const IDLE_CLOSE_MS = 60_000;
const MAX_PAGES = 4;
const LAUNCH_ARGS = ["--hide-scrollbars", "--mute-audio", "--autoplay-policy=no-user-gesture-required"];

interface PooledPage {
  page: Page;
  version: string;
  viewport: string;
  /** Last time captured on this page; a capture before it reloads the page. */
  lastTime: number;
}

let browserPromise: Promise<Browser> | null = null;
let liveBrowser: Browser | null = null;
/** previewUrl → page. Map order is least- to most-recently used. */
const pages = new Map<string, PooledPage>();
let queue: Promise<void> = Promise.resolve();
let pending = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

const noop = () => {};

/** All capture work runs through this one queue, so Chrome only ever does one thing. */
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  pending++;
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  const run = queue.then(job);
  queue = run.then(noop, noop).then(() => {
    pending--;
    if (pending === 0 && liveBrowser) {
      idleTimer = setTimeout(() => void closeFrameCapture(), IDLE_CLOSE_MS);
      idleTimer.unref();
    }
  });
  return run;
}

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}

/** Kill Chrome synchronously; used where async cleanup cannot run. */
function killBrowserNow(): void {
  const proc = liveBrowser?.process();
  if (!proc?.pid || proc.exitCode !== null) return;
  try {
    // puppeteer starts Chrome detached, in its own process group.
    process.kill(-proc.pid, "SIGKILL");
  } catch {
    try {
      proc.kill("SIGKILL");
    } catch {
      // Already gone.
    }
  }
}

let exitCleanupInstalled = false;

/**
 * Chrome must not outlive the server (`tsx watch` restarts the CLI on every
 * edit). puppeteer's own SIGTERM/SIGHUP handlers keep the process alive, so
 * they are off; these kill Chrome and then let the signal do its default.
 */
function installExitCleanup(): void {
  if (exitCleanupInstalled) return;
  exitCleanupInstalled = true;
  process.on("exit", killBrowserNow);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    const onSignal = () => {
      killBrowserNow();
      if (process.listenerCount(signal) === 1) {
        process.removeListener(signal, onSignal);
        process.kill(process.pid, signal);
      }
    };
    process.on(signal, onSignal);
  }
}

function getBrowser(): Promise<Browser> {
  if (browserPromise) return browserPromise;
  const launching = (async () => {
    const executable = await resolveChromeExecutable();
    if (!executable) throw new ChromeUnavailableError();
    installExitCleanup();
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: executable.path,
      args: LAUNCH_ARGS,
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
    });
    liveBrowser = browser;
    browser.on("disconnected", () => {
      if (liveBrowser === browser) liveBrowser = null;
      if (browserPromise === launching) {
        browserPromise = null;
        pages.clear();
      }
    });
    return browser;
  })();
  browserPromise = launching;
  launching.catch(() => {
    if (browserPromise === launching) browserPromise = null;
  });
  return launching;
}

/** Close Chrome and forget every page. Safe to call when nothing is running. */
export async function closeFrameCapture(): Promise<void> {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  const launching = browserPromise;
  browserPromise = null;
  pages.clear();
  const browser = await launching?.catch(() => null);
  if (!browser) return;
  await browser.close().catch(() => browser.process()?.kill("SIGKILL"));
  if (liveBrowser === browser) liveBrowser = null;
}

async function waitForRuntime(page: Page): Promise<void> {
  const ready = await page
    .waitForFunction(() => (globalThis as any).__renderReady === true, { timeout: 5000 })
    .then(() => true, () => false);
  if (!ready) {
    await page
      .waitForFunction(
        () => {
          const timelines = (globalThis as any).__timelines;
          return !!timelines && Object.keys(timelines).length > 0;
        },
        { timeout: 1000 },
      )
      .catch(noop);
  }
  // seekCompositionTimeline's waitForPreferredSeekTarget (500 ms).
  await page
    .waitForFunction(
      () => {
        const w = globalThis as any;
        return typeof w.__player?.renderSeek === "function" || typeof w.__hf?.seek === "function";
      },
      { timeout: 500 },
    )
    .catch(noop);
}

function viewportKey(req: FrameCaptureRequest): string {
  return `${req.width}x${req.height}@${req.deviceScaleFactor}`;
}

function dropPage(previewUrl: string): void {
  const pooled = pages.get(previewUrl);
  pages.delete(previewUrl);
  void pooled?.page.close().catch(noop);
}

/**
 * The page for `req.previewUrl`, reused only while the project is unchanged
 * and the timeline only moves forward: GSAP `from()`/`set()` are not reliably
 * reversible, so a backward seek gets a freshly loaded page.
 */
async function pageFor(browser: Browser, req: FrameCaptureRequest, firstTime: number): Promise<PooledPage> {
  const existing = pages.get(req.previewUrl);
  if (
    existing &&
    !existing.page.isClosed() &&
    existing.version === req.version &&
    firstTime >= existing.lastTime
  ) {
    pages.delete(req.previewUrl);
    pages.set(req.previewUrl, existing);
    if (existing.viewport !== viewportKey(req)) {
      await existing.page.setViewport({
        width: req.width,
        height: req.height,
        deviceScaleFactor: req.deviceScaleFactor,
      });
      existing.viewport = viewportKey(req);
    }
    return existing;
  }
  if (existing) dropPage(req.previewUrl);

  const page = await browser.newPage();
  try {
    await page.setViewport({ width: req.width, height: req.height, deviceScaleFactor: req.deviceScaleFactor });
    await page.goto(req.previewUrl, { waitUntil: "domcontentloaded", timeout: 10_000 });
    await waitForRuntime(page);
  } catch (err) {
    await page.close().catch(noop);
    throw err;
  }
  const pooled: PooledPage = { page, version: req.version, viewport: viewportKey(req), lastTime: -Infinity };
  pages.set(req.previewUrl, pooled);
  while (pages.size > MAX_PAGES) {
    const oldest = pages.keys().next().value;
    if (oldest === undefined) break;
    dropPage(oldest);
  }
  return pooled;
}

/** The HyperFrames seek cascade, then the CLI's settle: seek completion, double rAF, fonts (≤ 500 ms). */
async function seekAndSettle(page: Page, time: number): Promise<void> {
  await page.evaluate((t: number) => {
    const w = globalThis as any;
    const call = (fn: unknown, receiver: unknown, args: unknown[]) => {
      if (typeof fn !== "function") return false;
      Reflect.apply(fn, receiver, args);
      return true;
    };
    const get = (target: unknown, key: string) =>
      (typeof target === "object" && target !== null) || typeof target === "function"
        ? Reflect.get(target, key)
        : undefined;
    const safe = Math.max(0, Number(t) || 0);
    const player = w.__player;
    const hf = w.__hf;
    if (call(get(player, "renderSeek"), player, [safe])) {
      // Preferred: the player's render seek.
    } else if (call(get(hf, "seek"), hf, [safe])) {
      // The runtime bridge.
    } else if (call(get(player, "seek"), player, [safe])) {
      // A player without renderSeek.
    } else {
      const timelines = w.__timelines;
      if (typeof timelines === "object" && timelines !== null) {
        for (const key of Object.keys(timelines)) {
          const timeline = timelines[key];
          call(get(timeline, "pause"), timeline, []);
          call(get(timeline, "seek"), timeline, [safe]);
        }
      }
    }
    const ticker = get(w.gsap, "ticker");
    call(get(ticker, "tick"), ticker, []);
  }, time);
  await page.evaluate(async () => {
    const wait = (globalThis as any).__hfWaitForSeekCompletion;
    if (typeof wait === "function") await wait();
  });
  // Not in the CLI sequence: on a freshly loaded page a visible <video> can
  // still be fetching or seeking when the runtime reports the seek done, and
  // the first frame then comes out black. Wait (≤ 3 s) until every rendered
  // video with a usable source has a decoded frame.
  await page
    .evaluate(
      (ms: number) =>
        new Promise<void>((done) => {
          const w = globalThis as any;
          const deadline = Date.now() + ms;
          const pending = () =>
            Array.from(w.document.querySelectorAll("video") as ArrayLike<any>).some(
              (v) =>
                v.getClientRects().length > 0 &&
                !v.error &&
                v.networkState !== 3 &&
                (v.readyState < 2 || v.seeking),
            );
          const check = () => (!pending() || Date.now() > deadline ? done() : w.setTimeout(check, 25));
          check();
        }),
      3000,
    )
    .catch(noop);
  await page.evaluate(
    () =>
      new Promise<void>((done) => {
        const w = globalThis as any;
        w.requestAnimationFrame(() => w.requestAnimationFrame(() => done()));
      }),
  );
  await page
    .evaluate((ms: number) => {
      const w = globalThis as any;
      const fonts = w.document?.fonts;
      if (typeof fonts !== "object" || fonts === null) return Promise.resolve();
      void w.document.body?.offsetHeight;
      return new Promise<void>((done) => {
        const deadline = w.setTimeout(done, ms);
        w.requestAnimationFrame(() => {
          if (fonts.status !== "loading" || !fonts.ready) {
            w.clearTimeout(deadline);
            done();
            return;
          }
          Promise.resolve(fonts.ready).then(() => {
            w.clearTimeout(deadline);
            done();
          });
        });
      });
    }, 500)
    .catch(noop);
}

async function captureOne(pooled: PooledPage, time: number, req: FrameCaptureRequest): Promise<Buffer> {
  const { page } = pooled;
  await seekAndSettle(page, time);
  pooled.lastTime = time;
  // getElementScreenshotClip only reads layout (getBoundingClientRect); it
  // does not touch the DOM, so the page stays reusable after a selector capture.
  const clip = req.selector
    ? await page.evaluate(getElementScreenshotClip, req.selector, req.selectorIndex)
    : undefined;
  const shot = await page.screenshot(
    req.format === "png"
      ? { type: "png", ...(clip ? { clip } : {}) }
      : { type: "jpeg", quality: 80, ...(clip ? { clip } : {}) },
  );
  return Buffer.from(shot);
}

async function runCapture(req: FrameCaptureRequest): Promise<(Buffer | null)[]> {
  throwIfAborted(req.signal);
  const browser = await getBrowser();
  const fps = req.fps > 0 ? req.fps : 30;
  const order = req.times
    .map((t, index) => ({ t: Math.round(Math.max(0, t) * fps) / fps, index }))
    .sort((a, b) => a.t - b.t);
  const out: (Buffer | null)[] = req.times.map(() => null);
  let pooled: PooledPage | null = null;
  for (const { t, index } of order) {
    throwIfAborted(req.signal);
    pooled ??= await pageFor(browser, req, t);
    try {
      out[index] = await captureOne(pooled, t, req);
    } catch (err) {
      if (req.signal.aborted) throw abortError();
      console.warn(`[adapter-hyperframes] frame capture failed at t=${t}:`, err instanceof Error ? err.message : err);
      dropPage(req.previewUrl);
      pooled = null;
    }
  }
  return out;
}

/**
 * Capture `req.times` from the preview at `req.previewUrl`. One entry per
 * requested time, in request order; null where that frame failed. Rejects
 * with `ChromeUnavailableError` when no Chrome resolves, and with an
 * `AbortError` when `req.signal` aborts.
 */
export function captureFrames(req: FrameCaptureRequest): Promise<(Buffer | null)[]> {
  if (req.signal.aborted) return Promise.reject(abortError());
  return enqueue(() => runCapture(req));
}
