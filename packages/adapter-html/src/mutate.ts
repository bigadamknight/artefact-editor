import type { Block, Command, ProjectFiles } from "@artefact-editor/core";
import {
  escapeHtmlText,
  findOneMatching,
  getElementSourceLocation,
} from "./selector.js";
import { locateScriptVarValue } from "./scriptVar.js";
import { escapeRegex } from "./regex.js";

interface PendingEdit {
  start: number;
  end: number;
  replacement: string;
}

interface TextSwap {
  oldText: string;
  newText: string;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function applyEdits(source: string, edits: PendingEdit[]): string {
  // Validate non-overlapping, then apply right-to-left so offsets remain valid.
  const sorted = [...edits].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.start < sorted[i - 1]!.end) {
      throw new Error("Overlapping edits in same file");
    }
  }
  let out = source;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const e = sorted[i]!;
    out = out.slice(0, e.start) + e.replacement + out.slice(e.end);
  }
  return out;
}

function upsertStyleProp(style: string, prop: string, value: string): string {
  const parts = style.split(";").map((s) => s.trim()).filter(Boolean);
  let found = false;
  const out = parts.map((p) => {
    const idx = p.indexOf(":");
    if (idx < 0) return p;
    const k = p.slice(0, idx).trim().toLowerCase();
    if (k === prop.toLowerCase()) {
      found = true;
      return `${prop}: ${value}`;
    }
    return p;
  });
  if (!found) out.push(`${prop}: ${value}`);
  return out.join("; ");
}

function planSelectorEdit(
  source: string,
  block: Block,
  key: string,
  newValue: string,
  textSwaps: TextSwap[],
): PendingEdit {
  if (block.source.tag !== "selector") {
    throw new Error("planSelectorEdit called on non-selector block");
  }
  const el = findOneMatching(source, block.source.selector);
  const loc = getElementSourceLocation(el);

  if (key.startsWith("style.")) {
    const prop = key.slice("style.".length);
    if (!loc.startTag) {
      throw new Error(`block ${block.id}: missing start tag location`);
    }
    const tagSource = source.slice(loc.startTag.startOffset, loc.startTag.endOffset);
    const styleAttrRe = /\sstyle\s*=\s*("([^"]*)"|'([^']*)')/i;
    const m = styleAttrRe.exec(tagSource);
    if (m) {
      const existing = m[2] ?? m[3] ?? "";
      const newStyle = upsertStyleProp(existing, prop, newValue);
      const matchStart = loc.startTag.startOffset + m.index;
      const matchEnd = matchStart + m[0].length;
      return { start: matchStart, end: matchEnd, replacement: ` style="${escapeAttr(newStyle)}"` };
    }
    const closeIdx = tagSource.lastIndexOf(">");
    if (closeIdx < 0) throw new Error(`Cannot find tag close for block ${block.id}`);
    const insertAt = loc.startTag.startOffset + (tagSource[closeIdx - 1] === "/" ? closeIdx - 1 : closeIdx);
    return {
      start: insertAt,
      end: insertAt,
      replacement: ` style="${escapeAttr(`${prop}: ${newValue}`)}"`,
    };
  }

  if (block.kind === "text" && key === "text") {
    if (!loc.startTag || !loc.endTag) {
      throw new Error(
        `text block ${block.id}: element must have separate start and end tags (no self-closing)`,
      );
    }
    const oldRaw = source.slice(loc.startTag.endOffset, loc.endTag.startOffset);
    const oldText = decodeHtmlEntities(oldRaw).trim();
    const newText = newValue.trim();
    // Only mirror non-trivial text swaps into bundled JS so we don't accidentally
    // rewrite punctuation or single common words across a bundle.
    if (oldText.length >= 4 && oldText !== newText) {
      textSwaps.push({ oldText, newText });
    }
    return {
      start: loc.startTag.endOffset,
      end: loc.endTag.startOffset,
      replacement: escapeHtmlText(newValue),
    };
  }

  // attribute edit (src, alt, or any string attribute)
  if (!loc.startTag) {
    throw new Error(`block ${block.id}: missing start tag location`);
  }
  // Find the existing attribute or insert before the closing >.
  const tagSource = source.slice(loc.startTag.startOffset, loc.startTag.endOffset);
  const attrRe = new RegExp(
    `\\s${escapeRegex(key)}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`,
    "i",
  );
  const m = attrRe.exec(tagSource);
  if (m) {
    const matchStart = loc.startTag.startOffset + m.index;
    const matchEnd = matchStart + m[0].length;
    return {
      start: matchStart,
      end: matchEnd,
      replacement: ` ${key}="${escapeAttr(newValue)}"`,
    };
  }
  // Insert new attribute right before closing > or />.
  const closeIdx = tagSource.lastIndexOf(">");
  if (closeIdx < 0) throw new Error(`Cannot find tag close for block ${block.id}`);
  const insertAt = loc.startTag.startOffset + (tagSource[closeIdx - 1] === "/" ? closeIdx - 1 : closeIdx);
  return {
    start: insertAt,
    end: insertAt,
    replacement: ` ${key}="${escapeAttr(newValue)}"`,
  };
}

function planCssVarEdit(source: string, block: Block, newValue: string): PendingEdit {
  if (block.source.tag !== "cssVar") {
    throw new Error("planCssVarEdit called on non-cssVar block");
  }
  const re = new RegExp(`(${escapeRegex(block.source.cssVar)})(\\s*:\\s*)([^;\\n}]+)`, "m");
  const m = re.exec(source);
  if (!m) throw new Error(`CSS variable not found: ${block.source.cssVar}`);
  const valueStart = m.index + m[1]!.length + m[2]!.length;
  const valueEnd = valueStart + m[3]!.length;
  return {
    start: valueStart,
    end: valueEnd,
    replacement: newValue,
  };
}

function planAstVarEdit(source: string, block: Block, newValue: string): PendingEdit {
  if (block.source.tag !== "astVar") {
    throw new Error("planAstVarEdit called on non-astVar block");
  }
  const trimmed = String(newValue).trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    throw new Error(
      `Script variable ${block.source.varName} must be a numeric literal, got: ${newValue}`,
    );
  }
  const loc = locateScriptVarValue(source, block.source.varName);
  return { start: loc.start, end: loc.end, replacement: trimmed };
}

export async function applyCommands(
  files: ProjectFiles,
  blocks: Block[],
  commands: Command[],
): Promise<void> {
  const blocksById = new Map(blocks.map((b) => [b.id, b]));
  const editsByFile = new Map<string, PendingEdit[]>();
  const textSwaps: TextSwap[] = [];

  for (const cmd of commands) {
    if (cmd.type !== "setProperty") continue;
    const block = blocksById.get(cmd.blockId);
    if (!block) throw new Error(`Unknown block: ${cmd.blockId}`);
    const file = block.source.file;
    let source = editsByFile.get(file) === undefined ? await files.read(file) : null;
    // We need the original source per file once.
    if (!editsByFile.has(file)) editsByFile.set(file, []);
    const edits = editsByFile.get(file)!;
    if (source == null) source = await files.read(file);

    let edit: PendingEdit;
    if (block.source.tag === "selector") {
      edit = planSelectorEdit(source, block, cmd.key, String(cmd.value), textSwaps);
    } else if (block.source.tag === "cssVar") {
      edit = planCssVarEdit(source, block, String(cmd.value));
    } else {
      edit = planAstVarEdit(source, block, String(cmd.value));
    }
    edits.push(edit);
  }

  for (const [file, edits] of editsByFile) {
    if (edits.length === 0) continue;
    const original = await files.read(file);
    const updated = applyEdits(original, edits);
    if (updated !== original) {
      await files.write(file, updated);
    }
  }

  if (textSwaps.length > 0) {
    await mirrorTextSwapsIntoBundles(files, textSwaps, new Set(editsByFile.keys()));
  }
}

const BUNDLE_EXTENSIONS = /\.(js|mjs|cjs|css)$/i;
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".vite",
  "dist",
  "renders",
  ".thumbnails",
  ".hyperframes-cache",
]);

async function listFilesRecursive(
  files: ProjectFiles,
  dir: string,
  acc: string[],
): Promise<void> {
  const entries = await files.list(dir);
  for (const name of entries) {
    if (name.startsWith(".")) continue;
    if (SKIP_DIRS.has(name)) continue;
    const path = dir ? `${dir}/${name}` : name;
    if (BUNDLE_EXTENSIONS.test(name)) {
      acc.push(path);
      continue;
    }
    if (await files.isDirectory(path)) {
      await listFilesRecursive(files, path, acc);
    }
  }
}

/**
 * Built React/Vite apps shipped as static artefacts contain their original
 * strings hardcoded in JS bundles. Editing the HTML alone has no visible
 * effect because hydration overwrites the DOM with the bundle's strings.
 * Mirror text swaps as quoted-string replacements so the rendered page picks
 * up the new value after iframe reload.
 */
async function mirrorTextSwapsIntoBundles(
  files: ProjectFiles,
  swaps: TextSwap[],
  alreadyEdited: Set<string>,
): Promise<void> {
  const bundlePaths: string[] = [];
  await listFilesRecursive(files, "", bundlePaths);

  // Build needle/replacement candidates per swap, in priority order:
  //   1) quoted in JS string literals (double / single / backtick)
  //   2) the trimmed text plus its trailing-punctuation-stripped variant,
  //      as a direct substring replace, but only when the needle is long
  //      enough and occurs exactly once in the file (safety against
  //      catastrophic over-replacement in minified bundles).
  const trailingPunct = /[!?.…,:;]+$/;
  const candidatesPerSwap = swaps.map((s) => {
    const out: Array<{ kind: "quoted" | "unique"; old: string; new: string }> = [];
    const dq = (t: string) => JSON.stringify(t);
    const sq = (t: string) => `'${t.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
    const bt = (t: string) => `\`${t.replace(/\\/g, "\\\\").replace(/`/g, "\\`")}\``;
    out.push({ kind: "quoted", old: dq(s.oldText), new: dq(s.newText) });
    out.push({ kind: "quoted", old: sq(s.oldText), new: sq(s.newText) });
    out.push({ kind: "quoted", old: bt(s.oldText), new: bt(s.newText) });

    if (s.oldText.length >= 8 && /\s/.test(s.oldText)) {
      out.push({ kind: "unique", old: s.oldText, new: s.newText });
      const oldStripped = s.oldText.replace(trailingPunct, "");
      const newStripped = s.newText.replace(trailingPunct, "");
      if (oldStripped !== s.oldText && oldStripped.length >= 8) {
        out.push({ kind: "unique", old: oldStripped, new: newStripped });
      }
    }
    return out;
  });

  for (const path of bundlePaths) {
    if (alreadyEdited.has(path)) continue;
    let source: string;
    try {
      source = await files.read(path);
    } catch {
      continue;
    }
    let updated = source;
    for (const candidates of candidatesPerSwap) {
      let matched = false;
      for (const c of candidates) {
        if (c.kind === "quoted") {
          if (updated.includes(c.old)) {
            updated = updated.split(c.old).join(c.new);
            matched = true;
          }
        } else {
          // Unique-substring replace — guard against multiple hits.
          const first = updated.indexOf(c.old);
          if (first < 0) continue;
          const second = updated.indexOf(c.old, first + c.old.length);
          if (second >= 0) continue;
          updated = updated.slice(0, first) + c.new + updated.slice(first + c.old.length);
          matched = true;
        }
        if (matched) break;
      }
    }
    if (updated !== source) {
      await files.write(path, updated);
    }
  }
}
