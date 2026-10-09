/**
 * A client cache of thumbnail images, as object URLs.
 *
 * Requests for the same URL share one fetch. The fetch is aborted once every
 * caller waiting on it has given up (its tile scrolled out of view). Entries
 * keep recency order in a Map; over `max`, the older half is revoked and
 * dropped at once, so eviction runs rarely.
 */

export interface ThumbnailCache {
  /**
   * Resolves to an object URL for `url`. Aborting `signal` withdraws this
   * caller; the shared fetch stops when no caller is left.
   */
  get(url: string, signal?: AbortSignal): Promise<string>;
  /** The object URL for `url` when it is already loaded. */
  peek(url: string): string | undefined;
  /** Loaded entries. */
  readonly size: number;
  /** Aborts every fetch and revokes every object URL. The cache stays usable. */
  dispose(): void;
}

interface Pending {
  promise: Promise<string>;
  controller: AbortController;
  waiters: number;
}

export function createThumbnailCache(max = 500): ThumbnailCache {
  const ready = new Map<string, string>();
  const pending = new Map<string, Pending>();

  function insert(url: string, objectUrl: string): void {
    ready.set(url, objectUrl);
    if (ready.size <= max) return;
    let drop = ready.size - Math.floor(max / 2);
    for (const [key, value] of ready) {
      if (drop-- <= 0) break;
      URL.revokeObjectURL(value);
      ready.delete(key);
    }
  }

  async function load(url: string, entry: Pending): Promise<string> {
    const response = await fetch(url, { signal: entry.controller.signal });
    if (!response.ok) throw new Error(`Thumbnail failed (${response.status})`);
    const blob = await response.blob();
    entry.controller.signal.throwIfAborted();
    const objectUrl = URL.createObjectURL(blob);
    insert(url, objectUrl);
    return objectUrl;
  }

  function start(url: string): Pending {
    const entry = { controller: new AbortController(), waiters: 0 } as Pending;
    entry.promise = load(url, entry).finally(() => {
      if (pending.get(url) === entry) pending.delete(url);
    });
    // Callers that left before it settled never read it; keep it from surfacing as unhandled.
    entry.promise.catch(() => {});
    pending.set(url, entry);
    return entry;
  }

  function withdraw(url: string, entry: Pending): void {
    entry.waiters -= 1;
    if (entry.waiters > 0 || pending.get(url) !== entry) return;
    pending.delete(url);
    entry.controller.abort();
  }

  return {
    get(url, signal) {
      const hit = ready.get(url);
      if (hit) {
        // Refresh recency.
        ready.delete(url);
        ready.set(url, hit);
        return Promise.resolve(hit);
      }
      if (signal?.aborted) return Promise.reject(signal.reason);
      const entry = pending.get(url) ?? start(url);
      entry.waiters += 1;
      signal?.addEventListener("abort", () => withdraw(url, entry), { once: true });
      return entry.promise;
    },
    peek(url) {
      return ready.get(url);
    },
    get size() {
      return ready.size;
    },
    dispose() {
      for (const entry of pending.values()) entry.controller.abort();
      pending.clear();
      for (const objectUrl of ready.values()) URL.revokeObjectURL(objectUrl);
      ready.clear();
    },
  };
}
