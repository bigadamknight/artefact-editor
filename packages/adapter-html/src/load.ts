import {
  parseManifest,
  type Block,
  type ProjectFiles,
  type Manifest,
  type ManifestBlock,
} from "@artefact-editor/core";
import { findOneMatching } from "./selector.js";

const TEXT_NODE = "#text";

interface TextNode {
  nodeName: typeof TEXT_NODE;
  value: string;
}

function getInnerText(el: { childNodes: Array<{ nodeName: string }> }): string {
  let out = "";
  for (const c of el.childNodes) {
    if (c.nodeName === TEXT_NODE) {
      out += (c as unknown as TextNode).value;
    }
  }
  return out;
}

function getAttr(
  el: { attrs: Array<{ name: string; value: string }> },
  name: string,
): string {
  return el.attrs.find((a) => a.name === name)?.value ?? "";
}

function findCssVar(css: string, varName: string): string {
  const re = new RegExp(`(${escapeRegex(varName)})\\s*:\\s*([^;\\n}]+)`, "m");
  const m = re.exec(css);
  if (!m) throw new Error(`CSS variable not found: ${varName}`);
  return m[2]!.trim();
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function readBlockValues(
  block: ManifestBlock,
  fileCache: Map<string, string>,
  files: ProjectFiles,
): Promise<Record<string, string>> {
  let contents = fileCache.get(block.source.file);
  if (contents == null) {
    contents = await files.read(block.source.file);
    fileCache.set(block.source.file, contents);
  }

  const values: Record<string, string> = {};

  if ("selector" in block.source) {
    const el = findOneMatching(contents, block.source.selector);
    for (const prop of block.properties) {
      if (block.kind === "text" && prop.key === "text") {
        values[prop.key] = getInnerText(el);
      } else if (block.kind === "image" && prop.key === "src") {
        values[prop.key] = getAttr(el, "src");
      } else if (block.kind === "image" && prop.key === "alt") {
        values[prop.key] = getAttr(el, "alt");
      } else if (prop.type === "string") {
        values[prop.key] = getAttr(el, prop.key);
      } else {
        throw new Error(
          `Unsupported property '${prop.key}' (${prop.type}) on selector block ${block.id}`,
        );
      }
    }
  } else {
    // CSS variable source — only color/string for v1
    const value = findCssVar(contents, block.source.cssVar);
    for (const prop of block.properties) {
      if (prop.key === "value") {
        values[prop.key] = value;
      } else {
        throw new Error(
          `cssVar block ${block.id} only supports a 'value' property, got '${prop.key}'`,
        );
      }
    }
  }

  return values;
}

export async function loadProject(files: ProjectFiles): Promise<{
  manifest: Manifest;
  blocks: Block[];
  entryFile: string;
}> {
  const raw = await files.read("manifest.json");
  const manifest = parseManifest(JSON.parse(raw));

  const fileCache = new Map<string, string>();
  if (!(await files.exists(manifest.entry))) {
    throw new Error(`entry file not found: ${manifest.entry}`);
  }

  const blocks: Block[] = [];
  for (const mb of manifest.blocks) {
    if (!(await files.exists(mb.source.file))) {
      throw new Error(`block ${mb.id} references missing file: ${mb.source.file}`);
    }
    const values = await readBlockValues(mb, fileCache, files);
    blocks.push({
      id: mb.id,
      kind: mb.kind,
      label: mb.label,
      source:
        "selector" in mb.source
          ? { tag: "selector", file: mb.source.file, selector: mb.source.selector }
          : { tag: "cssVar", file: mb.source.file, cssVar: mb.source.cssVar },
      descriptors: mb.properties,
      values,
    });
  }

  return { manifest, blocks, entryFile: manifest.entry };
}
