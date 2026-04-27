import type { Block, Command, ProjectFiles } from "@artefact-editor/core";
import {
  escapeHtmlText,
  findOneMatching,
  getElementSourceLocation,
} from "./selector.js";

interface PendingEdit {
  start: number;
  end: number;
  replacement: string;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function planSelectorEdit(
  source: string,
  block: Block,
  key: string,
  newValue: string,
): PendingEdit {
  if (block.source.tag !== "selector") {
    throw new Error("planSelectorEdit called on non-selector block");
  }
  const el = findOneMatching(source, block.source.selector);
  const loc = getElementSourceLocation(el);

  if (block.kind === "text" && key === "text") {
    if (!loc.startTag || !loc.endTag) {
      throw new Error(
        `text block ${block.id}: element must have separate start and end tags (no self-closing)`,
      );
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

export async function applyCommands(
  files: ProjectFiles,
  blocks: Block[],
  commands: Command[],
): Promise<void> {
  const blocksById = new Map(blocks.map((b) => [b.id, b]));
  const editsByFile = new Map<string, PendingEdit[]>();

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
      edit = planSelectorEdit(source, block, cmd.key, String(cmd.value));
    } else {
      edit = planCssVarEdit(source, block, String(cmd.value));
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
}
