import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { parse } from "parse5";

/**
 * Timeline thumbnails for `<video>` clips, cut from the clip's own media with
 * ffmpeg. Studio asks for a clip's thumbnail as
 * `GET /projects/:id/thumbnail/<comp>?selector=%23<clip-id>&t=<composition time>`.
 * Upstream answers every such request by screenshotting the composition in a
 * resident headless Chrome; this answers only the video case, without a
 * browser. Anything else (HTML scenes, sub-compositions) returns null and the
 * timeline shows the clip without frames.
 */
export interface VideoThumbnailRequest {
  projectDir: string;
  compPath: string;
  selector?: string;
  seekTime: number;
  outputWidth: number;
  outputHeight: number;
  format?: "jpeg" | "png";
  signal: AbortSignal;
}

interface VideoClip {
  src: string;
  start: number;
  mediaStart: number;
  rate: number;
}

type Node = {
  nodeName: string;
  attrs?: { name: string; value: string }[];
  childNodes?: Node[];
  content?: Node;
};

function findById(node: Node, id: string): Node | null {
  if (node.attrs?.some((a) => a.name === "id" && a.value === id)) return node;
  for (const child of [...(node.childNodes ?? []), ...(node.content ? [node.content] : [])]) {
    const hit = findById(child, id);
    if (hit) return hit;
  }
  return null;
}

function num(value: string | undefined, fallback: number): number {
  const n = value === undefined ? Number.NaN : Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function findVideoClip(html: string, selector: string | undefined): VideoClip | null {
  const id = selector?.match(/^#([\w-]+)$/)?.[1];
  if (!id) return null;
  const el = findById(parse(html) as unknown as Node, id);
  if (el?.nodeName !== "video") return null;
  const attr = (name: string) => el.attrs?.find((a) => a.name === name)?.value;
  const src = attr("src");
  if (!src || /^[a-z]+:/i.test(src)) return null;
  return {
    src,
    start: num(attr("data-start"), 0),
    mediaStart: num(attr("data-media-start"), 0),
    rate: num(attr("data-playback-rate"), 1),
  };
}

/** Composition time → source time for a clip, never before the media's start. */
export function sourceTime(clip: Pick<VideoClip, "start" | "mediaStart" | "rate">, seekTime: number): number {
  return Math.max(0, clip.mediaStart + Math.max(0, seekTime - clip.start) * clip.rate);
}

function grabFrame(file: string, at: number, req: VideoThumbnailRequest): Promise<Buffer | null> {
  const { outputWidth: w, outputHeight: h } = req;
  const codec = req.format === "png" ? "png" : "mjpeg";
  const args = [
    "-v", "error", "-ss", at.toFixed(3), "-i", file, "-frames:v", "1",
    "-vf", `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`,
    "-f", "image2pipe", "-c:v", codec, "-",
  ];
  return new Promise((done) => {
    const proc = spawn("ffmpeg", args, { signal: req.signal, stdio: ["ignore", "pipe", "ignore"] });
    const chunks: Buffer[] = [];
    proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    proc.on("error", () => done(null));
    proc.on("close", (code) => done(code === 0 && chunks.length > 0 ? Buffer.concat(chunks) : null));
  });
}

export async function videoClipThumbnail(req: VideoThumbnailRequest): Promise<Buffer | null> {
  const compFile = resolve(req.projectDir, req.compPath);
  let html: string;
  try {
    html = await readFile(compFile, "utf-8");
  } catch {
    return null;
  }
  const clip = findVideoClip(html, req.selector);
  if (!clip) return null;
  const media = resolve(dirname(compFile), clip.src);
  const rel = relative(req.projectDir, media);
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  return grabFrame(media, sourceTime(clip, req.seekTime), req);
}
