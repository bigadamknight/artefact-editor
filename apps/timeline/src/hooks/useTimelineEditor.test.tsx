// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  createStudioApi,
  openProjectHistory,
  type StudioApiAdapter,
} from "@hyperframes/studio-server";
import { usePlayerStore, type TimelineElement } from "@hyperframes/studio";
import { useTimelineEditor, type TimelineEditorState } from "./useTimelineEditor";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// apps/timeline/src/hooks -> repo root
// (happy-dom replaces URL, so resolve from the vitest-provided __dirname.)
const repoRoot = resolve(__dirname, "../../../..");
const fixtureDir = join(repoRoot, "examples", "hyperframes-timeline-sample");
const PROJECT_ID = "sample";

const LION_CLOSE: TimelineElement = {
  id: "lion-close",
  domId: "lion-close",
  tag: "video",
  start: 4.24,
  duration: 2.44,
  track: 0,
};

let root: Root | null = null;
const cleanups: Array<() => unknown> = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A copy of the fixture project served by the real studio-server routes. */
async function serveFixture() {
  const dir = tempDir("ae-timeline-project-");
  cpSync(fixtureDir, dir, { recursive: true });
  const history = await openProjectHistory({
    projectDir: dir,
    historyRoot: tempDir("ae-timeline-history-"),
  });
  cleanups.push(() => history.close());
  const api = createStudioApi({
    listProjects: () => [],
    resolveProject: (id: string) => (id === PROJECT_ID ? { id, dir } : null),
    history: () => history,
  } as unknown as StudioApiAdapter);
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith("/api/")) return new Response("{}", { status: 404 });
    return api.request(url.replace(/^\/api/, ""), init);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { read: () => readFileSync(join(dir, "index.html"), "utf8"), fetchMock };
}

/** The preview stand-in gets the markup only; the composition's scripts need the real runtime. */
function withoutScripts(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/g, "");
}

function mountEditor(iframe: HTMLIFrameElement): { current: TimelineEditorState } {
  const handle = {} as { current: TimelineEditorState };
  function Harness() {
    handle.current = useTimelineEditor(PROJECT_ID);
    return null;
  }
  root = createRoot(document.createElement("div"));
  act(() => root!.render(createElement(Harness)));
  act(() => {
    handle.current.player.setLiveIframe(iframe);
    usePlayerStore.getState().setElements([LION_CLOSE]);
  });
  return handle;
}

beforeEach(() => {
  usePlayerStore.getState().reset();
});

afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  for (const step of cleanups.splice(0).reverse()) await step();
});

describe("useTimelineEditor", () => {
  it("writes a clip move to index.html, tells the host, and undo restores it", async () => {
    const disk = await serveFixture();
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    iframe.contentDocument!.body.innerHTML = withoutScripts(disk.read());
    // Embedded in artefact-editor: the parent is another window.
    const hostPostMessage = vi.fn();
    vi.stubGlobal("parent", { postMessage: hostPostMessage });

    const editor = mountEditor(iframe);
    expect(disk.read()).toMatch(/id="lion-close"[^>]*data-start="4.24"/);

    await act(async () => {
      await editor.current.editCallbacks.onMoveElement!(LION_CLOSE, { start: 5, track: 0 });
    });
    expect(disk.read()).toMatch(/id="lion-close"[^>]*data-start="5"/);

    await act(async () => {
      await editor.current.history.undo();
    });
    expect(disk.read()).toMatch(/id="lion-close"[^>]*data-start="4.24"/);

    // One notice for the move and one for the undo, so the host reloads blocks.
    expect(hostPostMessage).toHaveBeenCalledTimes(2);
    expect(hostPostMessage).toHaveBeenCalledWith(
      { type: "ae:timeline-changed", projectId: PROJECT_ID },
      window.location.origin,
    );
  });

  it("moves through the multi-clip path as one undo step", async () => {
    const disk = await serveFixture();
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    iframe.contentDocument!.body.innerHTML = withoutScripts(disk.read());

    const editor = mountEditor(iframe);
    await act(async () => {
      await editor.current.editCallbacks.onMoveElements!(
        [{ element: LION_CLOSE, updates: { start: 6, track: 0 } }],
        "drag-1",
        "timing",
      );
    });
    expect(disk.read()).toMatch(/id="lion-close"[^>]*data-start="6"/);

    await act(async () => {
      await editor.current.history.undo();
    });
    expect(disk.read()).toMatch(/id="lion-close"[^>]*data-start="4.24"/);
  });
});
