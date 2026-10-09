import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createThumbnailCache } from "./thumbnailCache";

let nextObjectUrl = 0;
const revoked: string[] = [];

beforeEach(() => {
  nextObjectUrl = 0;
  revoked.length = 0;
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:thumb-${nextObjectUrl++}`);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation((url: string) => {
    revoked.push(url);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function stubFetch() {
  const fetchMock = vi.fn(async () => new Response(new Blob(["png"], { type: "image/png" })));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("createThumbnailCache", () => {
  it("drops the older half once it holds more than max entries", async () => {
    stubFetch();
    const cache = createThumbnailCache(500);
    for (let i = 0; i < 500; i++) await cache.get(`/thumb?t=${i}`);
    expect(cache.size).toBe(500);
    expect(revoked).toEqual([]);

    await cache.get("/thumb?t=500");
    expect(cache.size).toBe(250);
    expect(revoked).toHaveLength(251);
    expect(revoked[0]).toBe("blob:thumb-0");
    expect(cache.peek("/thumb?t=0")).toBeUndefined();
    expect(cache.peek("/thumb?t=500")).toBe("blob:thumb-500");
  });

  it("shares one fetch between callers of the same URL", async () => {
    const fetchMock = stubFetch();
    const cache = createThumbnailCache();
    const [a, b] = await Promise.all([cache.get("/thumb?t=1"), cache.get("/thumb?t=1")]);
    expect(a).toBe(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Loaded entries answer without another fetch.
    await expect(cache.get("/thumb?t=1")).resolves.toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aborts the fetch only when every caller has withdrawn", async () => {
    let fetchSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            fetchSignal = init?.signal ?? undefined;
            fetchSignal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
          }),
      ),
    );
    const cache = createThumbnailCache();
    const first = new AbortController();
    const second = new AbortController();
    const pending = cache.get("/thumb?t=2", first.signal);
    void cache.get("/thumb?t=2", second.signal).catch(() => {});

    first.abort();
    expect(fetchSignal?.aborted).toBe(false);
    second.abort();
    expect(fetchSignal?.aborted).toBe(true);
    await expect(pending).rejects.toThrow();
    expect(cache.size).toBe(0);
  });

  it("does not cache a failed response", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const cache = createThumbnailCache();
    await expect(cache.get("/thumb?t=3")).rejects.toThrow(/500/);
    await expect(cache.get("/thumb?t=3")).rejects.toThrow(/500/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
