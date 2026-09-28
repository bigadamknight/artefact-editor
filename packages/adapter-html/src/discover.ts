import { parse } from "parse5";
import type { DefaultTreeAdapterMap } from "parse5";
import type { ManifestBlock } from "@artefact-editor/core";

type Element = DefaultTreeAdapterMap["element"];
type Node = DefaultTreeAdapterMap["node"];

function isElement(node: Node): node is Element {
  return "tagName" in node && "attrs" in node && "childNodes" in node;
}

function getAttr(el: Element, name: string): string | undefined {
  return el.attrs.find((a) => a.name === name)?.value;
}

const BLOCK_ID_RE = /^blk_[a-z0-9_]+$/;

/**
 * Synthesise ManifestBlock entries by walking `[data-edit-id]` elements
 * in an HTML document. The block kind is inferred from the element's tag
 * (image / audio for media tags including the editframe `<ef-*>` family;
 * text for everything else) and properties default to the natural edit
 * surface for that kind: `text` for text blocks, `src` + `alt` for image
 * blocks, `src` + `data-volume` for audio blocks.
 *
 * This is a fallback path: an explicit `manifest.blocks` entry with the
 * same id is preferred and overrides the synthetic one (see
 * {@link mergeBlocks}). Discovery exists so vibe-coded compositions can
 * ship a 4-line manifest (`version`, `artefact`, `entry`, `name`) and
 * still get a usable inspector.
 */
export function discoverBlocks(html: string, file: string): ManifestBlock[] {
  const document = parse(html, { sourceCodeLocationInfo: false });
  const out: ManifestBlock[] = [];
  const seen = new Set<string>();

  function walk(node: Node) {
    if (isElement(node)) {
      const id = getAttr(node, "data-edit-id");
      if (id && BLOCK_ID_RE.test(id) && !seen.has(id)) {
        seen.add(id);
        const block = buildBlock(node, id, file);
        if (block) out.push(block);
      }
    }
    const children = (node as { childNodes?: Node[] }).childNodes;
    if (children) for (const c of children) walk(c);
  }
  walk(document);
  return out;
}

function buildBlock(el: Element, id: string, file: string): ManifestBlock | null {
  const tag = el.tagName.toLowerCase();
  const explicitLabel = getAttr(el, "data-edit-label");
  const label = explicitLabel ?? id;
  const source = { file, selector: `[data-edit-id=${id}]` };

  if (isImageTag(tag)) {
    return {
      id,
      kind: "image",
      label,
      source,
      properties: [
        { key: "src", type: "asset", canonical: true },
        { key: "alt", type: "string" },
      ],
    };
  }
  if (isAudioTag(tag)) {
    return {
      id,
      kind: "audio",
      label,
      source,
      properties: [
        { key: "src", type: "asset", canonical: true },
        { key: "data-volume", type: "number", min: 0, max: 1, step: 0.05 },
      ],
    };
  }
  if (isVideoTag(tag)) {
    // No block kind for video yet — image is the closest match (it has src and
    // is treated as a media surface by the inspector). Revisit when we add a
    // dedicated 'video' kind.
    return {
      id,
      kind: "image",
      label,
      source,
      properties: [
        { key: "src", type: "asset", canonical: true },
      ],
    };
  }
  return {
    id,
    kind: "text",
    label,
    source,
    properties: [{ key: "text", type: "string", canonical: true }],
  };
}

function isImageTag(tag: string): boolean {
  return tag === "img" || tag === "ef-image";
}
function isAudioTag(tag: string): boolean {
  return tag === "audio" || tag === "ef-audio";
}
function isVideoTag(tag: string): boolean {
  return tag === "video" || tag === "ef-video";
}

/**
 * Merge explicit (manifest-authored) blocks with auto-discovered blocks.
 * Explicit wins by id. Order: explicit blocks first (preserving manifest
 * order), then any discovered blocks not already covered (in DOM order).
 */
export function mergeBlocks(
  explicit: ManifestBlock[],
  discovered: ManifestBlock[],
): ManifestBlock[] {
  const explicitIds = new Set(explicit.map((b) => b.id));
  const out = [...explicit];
  for (const d of discovered) {
    if (!explicitIds.has(d.id)) out.push(d);
  }
  return out;
}
