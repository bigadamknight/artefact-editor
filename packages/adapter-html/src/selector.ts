import { parse, defaultTreeAdapter } from "parse5";
import type { DefaultTreeAdapterMap } from "parse5";

type Element = DefaultTreeAdapterMap["element"];
type Node = DefaultTreeAdapterMap["node"];

/**
 * Match an element by a small subset of CSS selectors:
 *   #foo
 *   [attr=value]
 *   [attr="value"]
 *   [attr='value']
 * Combinations like `tag[attr=value]` and bare `tag` are supported but discouraged
 * (use [data-edit-id="..."] for stability).
 */
export interface ParsedSelector {
  tag?: string;
  id?: string;
  attrs: Array<{ name: string; value: string }>;
}

export function parseSelector(raw: string): ParsedSelector {
  const result: ParsedSelector = { attrs: [] };
  let rest = raw.trim();

  const tagMatch = /^([a-zA-Z][a-zA-Z0-9-]*)/.exec(rest);
  if (tagMatch) {
    result.tag = tagMatch[1]!.toLowerCase();
    rest = rest.slice(tagMatch[0].length);
  }

  const idMatch = /^#([a-zA-Z][a-zA-Z0-9_-]*)/.exec(rest);
  if (idMatch) {
    result.id = idMatch[1]!;
    rest = rest.slice(idMatch[0].length);
  }

  const attrRe = /^\[([a-zA-Z_][a-zA-Z0-9_-]*)=("([^"]*)"|'([^']*)'|([^\]\s"']+))\]/;
  while (rest.startsWith("[")) {
    const m = attrRe.exec(rest);
    if (!m) throw new Error(`Bad attribute selector segment: ${rest}`);
    const name = m[1]!;
    const value = m[3] ?? m[4] ?? m[5] ?? "";
    result.attrs.push({ name, value });
    rest = rest.slice(m[0].length);
  }

  if (rest.length > 0) {
    throw new Error(`Unsupported selector syntax: ${raw}`);
  }
  if (!result.tag && !result.id && result.attrs.length === 0) {
    throw new Error(`Empty selector: ${raw}`);
  }
  return result;
}

function matches(el: Element, sel: ParsedSelector): boolean {
  if (sel.tag && el.tagName.toLowerCase() !== sel.tag) return false;
  if (sel.id) {
    const id = el.attrs.find((a) => a.name === "id")?.value;
    if (id !== sel.id) return false;
  }
  for (const want of sel.attrs) {
    const got = el.attrs.find((a) => a.name === want.name)?.value;
    if (got !== want.value) return false;
  }
  return true;
}

function isElement(node: Node): node is Element {
  return "tagName" in node && "attrs" in node && "childNodes" in node;
}

export function findAllMatching(html: string, selector: string): Element[] {
  const sel = parseSelector(selector);
  const document = parse(html, { sourceCodeLocationInfo: true });
  const results: Element[] = [];
  const walk = (node: Node) => {
    if (isElement(node) && matches(node, sel)) results.push(node);
    const children = (node as { childNodes?: Node[] }).childNodes;
    if (children) for (const c of children) walk(c);
  };
  walk(document);
  return results;
}

export function findOneMatching(html: string, selector: string): Element {
  const matches = findAllMatching(html, selector);
  if (matches.length === 0) throw new Error(`No element matches selector: ${selector}`);
  if (matches.length > 1) {
    throw new Error(`Selector matched ${matches.length} elements (expected 1): ${selector}`);
  }
  return matches[0]!;
}

export function getElementSourceLocation(el: Element) {
  const loc = (el as Element & { sourceCodeLocation?: unknown }).sourceCodeLocation as
    | {
        startTag?: { startOffset: number; endOffset: number };
        endTag?: { startOffset: number; endOffset: number };
        startOffset: number;
        endOffset: number;
      }
    | undefined;
  if (!loc) throw new Error("Element has no source location (parse5 must be invoked with sourceCodeLocationInfo)");
  return loc;
}

const HTML_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
};

export function escapeHtmlText(input: string): string {
  return input.replace(/[&<>]/g, (c) => HTML_ESCAPE[c]!);
}
