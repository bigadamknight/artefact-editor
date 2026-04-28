import {
  parseManifest,
  type Block,
  type ProjectFiles,
  type Manifest,
  type ManifestBlock,
  type PropertyDescriptor,
} from "@artefact-editor/core";
import { findOneMatching } from "./selector.js";
import { findScriptVar } from "./scriptVar.js";

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

function readSelectorBlock(
  block: ManifestBlock,
  contents: string,
): Record<string, string> {
  if (!("selector" in block.source)) throw new Error("not a selector block");
  const el = findOneMatching(contents, block.source.selector);
  const values: Record<string, string> = {};
  for (const prop of block.properties) {
    if (block.kind === "text" && prop.key === "text") {
      values[prop.key] = getInnerText(el);
    } else {
      // Any other property is read as an HTML attribute by name.
      // Works for src, alt, data-start, data-duration, data-volume, etc.
      values[prop.key] = getAttr(el, prop.key);
    }
  }
  return values;
}

function readCssVarBlock(
  block: ManifestBlock,
  contents: string,
): Record<string, string> {
  if (!("cssVar" in block.source)) throw new Error("not a cssVar block");
  const value = findCssVar(contents, block.source.cssVar);
  const values: Record<string, string> = {};
  for (const prop of block.properties) {
    if (prop.key !== "value") {
      throw new Error(
        `cssVar block ${block.id} only supports a 'value' property, got '${prop.key}'`,
      );
    }
    values[prop.key] = value;
  }
  return values;
}

function readAstVarBlock(
  block: ManifestBlock,
  contents: string,
): Record<string, string> {
  if (!("astVar" in block.source)) throw new Error("not an astVar block");
  const found = findScriptVar(contents, block.source.astVar);
  const values: Record<string, string> = {};
  for (const prop of block.properties) {
    if (prop.key !== "value") {
      throw new Error(
        `astVar block ${block.id} only supports a 'value' property, got '${prop.key}'`,
      );
    }
    values[prop.key] = found;
  }
  return values;
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

  if ("selector" in block.source) return readSelectorBlock(block, contents);
  if ("cssVar" in block.source) return readCssVarBlock(block, contents);
  if ("astVar" in block.source) return readAstVarBlock(block, contents);
  throw new Error(`Unknown source for block ${block.id}`);
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
    let source: Block["source"];
    if ("selector" in mb.source) {
      source = { tag: "selector", file: mb.source.file, selector: mb.source.selector };
    } else if ("cssVar" in mb.source) {
      source = { tag: "cssVar", file: mb.source.file, cssVar: mb.source.cssVar };
    } else if ("astVar" in mb.source) {
      source = { tag: "astVar", file: mb.source.file, varName: mb.source.astVar };
    } else {
      throw new Error(
        `block ${mb.id}: html adapter doesn't handle source ${JSON.stringify(mb.source)}`,
      );
    }
    const descriptors: PropertyDescriptor[] = [...mb.properties];
    if (mb.kind === "text" && "selector" in mb.source) {
      // Synthetic style.* descriptors so the editor can show a Style section.
      // Live values are read from the iframe; pending edits flow through normal
      // setProperty commands and the adapter upserts them into the element's
      // inline style attribute on save.
      const STYLE_PROPS = [
        "color",
        "font-size",
        "font-weight",
        "font-family",
        "text-align",
        "letter-spacing",
        "line-height",
        "top",
        "left",
        "right",
        "bottom",
        "width",
        "height",
        "margin-top",
        "margin-right",
        "margin-bottom",
        "margin-left",
        "padding-top",
        "padding-right",
        "padding-bottom",
        "padding-left",
        "transform",
        "opacity",
        "z-index",
      ];
      for (const p of STYLE_PROPS) {
        descriptors.push({ key: `style.${p}`, type: "string" });
      }
    }
    blocks.push({
      id: mb.id,
      kind: mb.kind,
      label: mb.label,
      source,
      descriptors,
      values,
    });
  }

  return { manifest, blocks, entryFile: manifest.entry };
}
