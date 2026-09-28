// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { usePlayerStore, type TimelineElement } from "@hyperframes/studio";
import { TimelinePage } from "./pages/TimelinePage";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BRAND = /hyperframes|heygen/i;

const CLIPS: TimelineElement[] = [
  { id: "fairy-close", domId: "fairy-close", tag: "video", start: 0.2, duration: 4.04, track: 0 },
  { id: "lion-close", domId: "lion-close", tag: "video", start: 4.24, duration: 2.44, track: 0 },
  { id: "lion-voice", domId: "lion-voice", tag: "audio", start: 4.54, duration: 1.84, track: 10 },
];

let root: Root | null = null;

// happy-dom has no layout. Give elements a size and a ResizeObserver that
// reports it, as Studio's own timeline tests do, so clips actually mount.
class MockResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element) {
    this.callback(
      [
        {
          target,
          borderBoxSize: [{ inlineSize: target.clientWidth, blockSize: target.clientHeight }],
          contentRect: { width: target.clientWidth, height: target.clientHeight },
        } as unknown as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver,
    );
  }
  unobserve() {}
  disconnect() {}
}
const originalResizeObserver = globalThis.ResizeObserver;
const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");

beforeAll(() => {
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 900 });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 240 });
});

afterAll(() => {
  globalThis.ResizeObserver = originalResizeObserver;
  if (originalClientWidth) Object.defineProperty(HTMLElement.prototype, "clientWidth", originalClientWidth);
  if (originalClientHeight) Object.defineProperty(HTMLElement.prototype, "clientHeight", originalClientHeight);
});

async function settleUntil(predicate: () => boolean, tries = 60): Promise<void> {
  for (let attempt = 0; attempt < tries && !predicate(); attempt++) {
    await act(async () => {
      await new Promise<void>((done) => requestAnimationFrame(() => done()));
    });
  }
}

/** Visible text, including text inside open shadow roots. */
function deepText(node: Node): string {
  let text = "";
  if (node.nodeType === 3) text += node.textContent ?? "";
  if (node instanceof Element && node.shadowRoot) text += deepText(node.shadowRoot);
  for (const child of Array.from(node.childNodes)) text += deepText(child);
  return text;
}

/** Every element, including those inside open shadow roots. */
function deepElements(root: ParentNode): Element[] {
  const out: Element[] = [];
  for (const element of Array.from(root.querySelectorAll("*"))) {
    out.push(element);
    if (element.shadowRoot) out.push(...deepElements(element.shadowRoot));
  }
  return out;
}

function attributeValues(name: string): string[] {
  return deepElements(document)
    .filter((element) => element.hasAttribute(name))
    .map((element) => element.getAttribute(name) ?? "");
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    // No server: every request 404s. The page must still render its chrome.
    vi.fn(async () => new Response("{}", { status: 404 })),
  );
  window.location.hash = "#/p/sample";
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("timeline document branding", () => {
  it("names no upstream product in its title, text, labels or alt text", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(createElement(TimelinePage));
    });
    await act(async () => {
      const store = usePlayerStore.getState();
      store.setDuration(14.52);
      store.setElements(CLIPS);
      store.setTimelineReady(true);
    });

    // The page really rendered: transport and timeline clips are present.
    expect(document.querySelector('[aria-label="Playback"]')).not.toBeNull();
    await settleUntil(() => document.querySelectorAll("[data-clip]").length === CLIPS.length);
    expect(document.querySelectorAll("[data-clip]").length).toBe(CLIPS.length);
    const text = deepText(document.body);

    expect(text).not.toMatch(BRAND);
    // The preview player's own iframe lives in a shadow root.
    expect(attributeValues("title")).toContain("Composition preview");
    for (const name of ["title", "aria-label", "alt", "placeholder"]) {
      for (const value of attributeValues(name)) expect(value).not.toMatch(BRAND);
    }

    const indexHtml = readFileSync(resolve(__dirname, "../index.html"), "utf8");
    const title = /<title>([^<]*)<\/title>/.exec(indexHtml)?.[1];
    expect(title).toBe("Timeline");
    const favicon = /<link rel="icon"[^>]*href="([^"]+)"/.exec(indexHtml)?.[1];
    expect(favicon).toBe("/icon-192.png");
  });
});
