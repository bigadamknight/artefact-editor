// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { usePlayerStore, type TimelineElement } from "@hyperframes/studio";
import { useReviewTools, type ReviewToolsState } from "./useReviewTools";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CAPTIONS: TimelineElement = {
  id: "captions",
  domId: "captions",
  tag: "div",
  start: 1.25,
  duration: 2.5,
  track: 1,
};

let root: Root | null = null;

function mount(projectId = "sample"): { current: ReviewToolsState } {
  const handle = {} as { current: ReviewToolsState };
  function Harness() {
    handle.current = useReviewTools(projectId);
    return null;
  }
  root = createRoot(document.createElement("div"));
  act(() => root!.render(createElement(Harness)));
  return handle;
}

function query(url: string | null): URLSearchParams {
  expect(url).not.toBeNull();
  return new URL(url!, "http://localhost").searchParams;
}

beforeEach(() => {
  const store = usePlayerStore.getState();
  store.reset();
  store.setDuration(14.52);
  store.setElements([CAPTIONS]);
  store.setCurrentTime(6);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

describe("useReviewTools", () => {
  it("reviews the selected clip, then the ruler range, then the playhead", () => {
    const review = mount();
    act(() => review.current.handleOpenStrip());

    act(() => usePlayerStore.getState().setSelectedElementId("captions"));
    expect(review.current.range).toEqual({ from: 1.25, to: 3.75, source: "selection" });
    expect(review.current.rangeLabel).toBe("Selected clip · 1.25–3.75 s");

    act(() => {
      usePlayerStore.getState().setSelectedElementId(null);
      usePlayerStore.setState({ rangeSelection: { t0: 8, t1: 10.5 } });
    });
    expect(review.current.range).toEqual({ from: 8, to: 10.5, source: "range" });

    act(() => usePlayerStore.setState({ rangeSelection: null }));
    expect(review.current.range).toEqual({ from: 5.5, to: 6.5, source: "playhead" });
    const strip = query(review.current.stripUrl);
    expect(strip.get("from")).toBe("5.5");
    expect(strip.get("to")).toBe("6.5");
  });

  it("clamps the playhead window to the composition", () => {
    const review = mount();
    act(() => usePlayerStore.getState().setCurrentTime(14.4));
    expect(review.current.range).toEqual({ from: 13.9, to: 14.52, source: "playhead" });
    act(() => usePlayerStore.getState().setCurrentTime(0));
    expect(review.current.range).toEqual({ from: 0, to: 0.5, source: "playhead" });
  });

  it("builds onion and strip URLs with the count and the content revision", () => {
    const review = mount("my project");
    expect(review.current.onionUrl).toBeNull();
    expect(review.current.stripUrl).toBeNull();

    act(() => {
      review.current.handleToggleOnion();
      review.current.handleSetOnionCount(99);
      review.current.handleOpenStrip();
      review.current.handleSetStripCount(9);
      review.current.handleSetStripColumns(3);
    });
    expect(review.current.onionUrl).toMatch(/^\/api\/projects\/my%20project\/onion\?/);
    expect(review.current.stripUrl).toMatch(/^\/api\/projects\/my%20project\/strip\?/);
    const onion = query(review.current.onionUrl);
    expect(onion.get("n")).toBe("12");
    expect(onion.get("revision")).toBe("0");
    const strip = query(review.current.stripUrl);
    expect(strip.get("n")).toBe("9");
    expect(strip.get("columns")).toBe("3");
    expect(strip.get("revision")).toBe("0");

    // A content change moves the revision, so the images refetch.
    act(() => usePlayerStore.getState().bumpThumbnailRevisions(null));
    expect(query(review.current.onionUrl).get("revision")).toBe("1");
    expect(query(review.current.stripUrl).get("revision")).toBe("1");

    act(() => review.current.handleCloseStrip());
    expect(review.current.stripUrl).toBeNull();
  });
});
