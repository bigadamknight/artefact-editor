import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "parse5";
import { findScriptVar } from "@artefact-editor/adapter-html";

/**
 * The scenes of a HyperFrames composition, read from its source with parse5:
 * what an agent can ask the review routes to capture by `scene=`. A scene is
 * either a timed child (`data-start`) or a passive `data-scene` mark.
 *
 * Marks are for GSAP-driven videos whose timing lives in the script. The
 * HyperFrames runtime ignores them; only this file reads them:
 * - `data-scene="<id>"` (required, `/^[\w-]+$/`)
 * - `data-scene-start` (required): seconds, or the name of a top-level numeric
 *   const in the file's script, such as `T2`
 * - `data-scene-end` (optional): same forms; defaults to the next mark's start,
 *   then the composition's end
 * - `data-label` (optional)
 */
export interface Scene {
  id: string;
  label: string;
  /** Seconds, in the time of the composition that was listed. */
  start: number;
  duration: number;
  /** CSS selector for the element; empty for the synthetic root scene. */
  selector: string;
  kind: "video" | "composition" | "element" | "root" | "scene";
  /** The composition to capture this scene from (a sub-composition plays it at local time 0). */
  comp: string;
}

export interface SceneList {
  comp: string;
  fps: number;
  duration: number;
  width: number;
  height: number;
  scenes: Scene[];
}

type Node = {
  nodeName: string;
  attrs?: { name: string; value: string }[];
  childNodes?: Node[];
  content?: Node;
};

const attr = (node: Node, name: string) => node.attrs?.find((a) => a.name === name)?.value;

function num(value: string | undefined): number | null {
  const n = value === undefined ? Number.NaN : Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function children(node: Node): Node[] {
  return [...(node.childNodes ?? []), ...(node.content ? [node.content] : [])];
}

function findRoot(node: Node): Node | null {
  if (attr(node, "data-composition-id") !== undefined) return node;
  for (const child of children(node)) {
    const hit = findRoot(child);
    if (hit) return hit;
  }
  return null;
}

function findBySrc(node: Node, src: string): Node | null {
  if (attr(node, "data-composition-src") === src) return node;
  for (const child of children(node)) {
    const hit = findBySrc(child, src);
    if (hit) return hit;
  }
  return null;
}

/** Timed descendants of `node`, not descending into a timed element. */
function timedDescendants(node: Node, out: Node[] = []): Node[] {
  for (const child of children(node)) {
    if (attr(child, "data-start") !== undefined) {
      if (child.nodeName !== "audio") out.push(child);
    } else {
      timedDescendants(child, out);
    }
  }
  return out;
}

/** Every descendant with a `data-scene` mark, in document order, however deep. */
function markedDescendants(node: Node, out: Node[] = []): Node[] {
  for (const child of children(node)) {
    if (attr(child, "data-scene") !== undefined) out.push(child);
    markedDescendants(child, out);
  }
  return out;
}

/**
 * A scene time: seconds, or the name of a top-level numeric const in the
 * file's script. Expressions such as `T2 + 7` do not resolve.
 */
function resolveTime(html: string, raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const text = raw.trim();
  if (text !== "" && Number.isFinite(Number(text))) return Number(text);
  if (!/^[A-Za-z_$][\w$]*$/.test(text)) return null;
  try {
    const n = Number(findScriptVar(html, text));
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Duration of a sub-composition whose root has none: the clip that mounts it in index.html. */
async function mountedDuration(projectDir: string, compPath: string): Promise<number | null> {
  try {
    const index = parse(await readFile(join(projectDir, "index.html"), "utf-8")) as unknown as Node;
    const host = findBySrc(index, compPath);
    return host ? num(attr(host, "data-duration")) : null;
  } catch {
    return null;
  }
}

/** The scenes of `compPath` in `projectDir`, or null when the file cannot be read. */
export async function listScenes(projectDir: string, compPath: string): Promise<SceneList | null> {
  let html: string;
  try {
    html = await readFile(join(projectDir, compPath), "utf-8");
  } catch {
    return null;
  }
  const doc = parse(html) as unknown as Node;
  const root = findRoot(doc) ?? doc;
  const fps = num(attr(root, "data-fps")) ?? 30;
  const width = num(attr(root, "data-width")) ?? 1920;
  const height = num(attr(root, "data-height")) ?? 1080;

  const scenes: Scene[] = [];
  for (const el of timedDescendants(root)) {
    const id = attr(el, "id") ?? attr(el, "data-hf-id");
    if (!id) continue;
    const start = num(attr(el, "data-start")) ?? 0;
    const src = attr(el, "data-composition-src");
    const kind: Scene["kind"] =
      el.nodeName === "video" ? "video" : src || attr(el, "data-composition-id") ? "composition" : "element";
    scenes.push({
      id,
      label: attr(el, "data-label") ?? id,
      start,
      duration: num(attr(el, "data-duration")) ?? Number.NaN,
      selector: attr(el, "id") ? `#${id}` : `[data-hf-id="${id}"]`,
      kind,
      comp: src ?? compPath,
    });
  }

  const childEnd = Math.max(0, ...scenes.filter((s) => Number.isFinite(s.duration)).map((s) => s.start + s.duration));
  const duration =
    num(attr(root, "data-duration")) ??
    (compPath !== "index.html" ? await mountedDuration(projectDir, compPath) : null) ??
    childEnd;
  for (const scene of scenes) {
    if (!Number.isFinite(scene.duration)) scene.duration = Math.max(0, duration - scene.start);
  }

  const candidates: { el: Node; id: string; start: number }[] = [];
  for (const el of markedDescendants(root)) {
    const id = attr(el, "data-scene") ?? "";
    if (!/^[\w-]+$/.test(id)) continue;
    if (scenes.some((s) => s.id === id) || candidates.some((c) => c.id === id)) continue;
    const start = resolveTime(html, attr(el, "data-scene-start"));
    if (start === null) continue;
    candidates.push({ el, id, start });
  }
  // Walk backwards so "the next kept mark" is known when a mark has no end.
  const kept: Scene[] = [];
  let nextStart: number | undefined;
  for (const { el, id, start } of candidates.reverse()) {
    const end = resolveTime(html, attr(el, "data-scene-end")) ?? nextStart ?? duration;
    if (!(end > start)) continue;
    nextStart = start;
    kept.push({
      id,
      label: attr(el, "data-label") ?? id,
      start,
      duration: end - start,
      selector: `[data-scene="${id}"]`,
      kind: "scene",
      comp: compPath,
    });
  }
  scenes.push(...kept.reverse());

  if (scenes.length === 0) {
    const id = attr(root, "data-composition-id") ?? "root";
    scenes.push({ id: "root", label: id, start: 0, duration, selector: "", kind: "root", comp: compPath });
  }
  return { comp: compPath, fps, duration, width, height, scenes };
}

export interface RangeQuery {
  scene?: string;
  from?: number;
  to?: number;
  duration: number;
}

/**
 * The time range a review image covers: a scene's span, or `from`/`to`
 * (each defaulting to the composition's ends). Clamped to `[0, duration]`;
 * an empty or reversed range is an error string.
 */
export function resolveRange(
  scenes: Scene[],
  query: RangeQuery,
): { from: number; to: number } | { error: string } {
  let from: number;
  let to: number;
  if (query.scene !== undefined) {
    const scene = scenes.find((s) => s.id === query.scene);
    if (!scene) return { error: `unknown scene "${query.scene}"` };
    from = scene.start;
    to = scene.start + scene.duration;
  } else {
    from = query.from ?? 0;
    to = query.to ?? query.duration;
  }
  if (!(from < to)) return { error: "from must be less than to" };
  from = Math.min(Math.max(0, from), query.duration);
  to = Math.min(Math.max(0, to), query.duration);
  if (!(from < to)) return { error: `range is outside the composition (0–${query.duration}s)` };
  return { from, to };
}
