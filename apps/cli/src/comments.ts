import { randomUUID } from "node:crypto";
import type { Block, Comment, ProjectFiles } from "@artefact-editor/core";

const COMMENTS_FILE = "comments.json";

interface CommentsFile {
  version: 1;
  comments: Comment[];
}

export async function readComments(files: ProjectFiles): Promise<Comment[]> {
  if (!(await files.exists(COMMENTS_FILE))) return [];
  try {
    const raw = await files.read(COMMENTS_FILE);
    const parsed = JSON.parse(raw) as CommentsFile | { comments?: Comment[] };
    return parsed.comments ?? [];
  } catch {
    return [];
  }
}

export async function writeComments(files: ProjectFiles, comments: Comment[]): Promise<void> {
  const data: CommentsFile = { version: 1, comments };
  await files.write(COMMENTS_FILE, JSON.stringify(data, null, 2) + "\n");
}

export async function addComment(
  files: ProjectFiles,
  blockId: string,
  text: string,
): Promise<Comment> {
  const comments = await readComments(files);
  const comment: Comment = {
    id: randomUUID(),
    blockId,
    text,
    createdAt: new Date().toISOString(),
    status: "pending",
  };
  comments.push(comment);
  await writeComments(files, comments);
  return comment;
}

export async function deleteComment(files: ProjectFiles, commentId: string): Promise<boolean> {
  const comments = await readComments(files);
  const next = comments.filter((c) => c.id !== commentId);
  if (next.length === comments.length) return false;
  await writeComments(files, next);
  return true;
}

/**
 * Build the prompt that would be sent to an agent to apply pending comments.
 *
 * The shape matters more than the wording today — host apps will tune this
 * once we plug in a real agent loop. The current shape lists each comment
 * with the block it targets and the block's current value, then a flat list
 * of source files the agent would have access to. The "byte-identical except
 * for changed fields" rule is repeated explicitly to discourage stylistic
 * rewrites.
 */
export function buildApplyPrompt(args: {
  projectName: string;
  artefact: string;
  blocks: Block[];
  comments: Comment[];
  sourceFiles: string[];
}): string {
  const { projectName, artefact, blocks, comments, sourceFiles } = args;
  const blockById = new Map(blocks.map((b) => [b.id, b]));
  const lines: string[] = [];
  lines.push(
    `You are editing the ${artefact} artefact "${projectName}". The user has left these comments`,
    `on specific blocks. Apply each comment by editing the source files.`,
    "",
  );
  for (const c of comments) {
    const block = blockById.get(c.blockId);
    if (!block) continue;
    const sourceDesc = describeSource(block);
    const currentDesc = describeCurrentValue(block);
    lines.push(`Block: ${block.id} (kind=${block.kind}, source=${sourceDesc})`);
    lines.push(`Label: ${block.label}`);
    if (currentDesc) lines.push(`Current: ${currentDesc}`);
    lines.push(`Comment: ${c.text}`);
    lines.push("");
  }
  lines.push("Source files:");
  for (const f of sourceFiles) lines.push(`- ${f}`);
  lines.push("");
  lines.push(
    "After making changes, leave the source files byte-identical except for the",
    "fields the comments asked you to change. Do not reformat unrelated code.",
  );
  return lines.join("\n");
}

/**
 * Source files the agent would touch for a project. Manifest, entry, optional
 * spec.json, plus everything under assets/. We deliberately don't enumerate
 * the whole project tree — comments target individual blocks and the blocks
 * already point at their source files, so this list is descriptive context
 * rather than a sandbox boundary.
 */
export async function listSourceFiles(
  files: ProjectFiles,
  opts: { entry: string; specFile?: string; artefact: string; blocks: Block[] },
): Promise<string[]> {
  const out = new Set<string>(["manifest.json", opts.entry]);
  if (opts.specFile) out.add(opts.specFile);
  if (opts.artefact === "image-template") out.add("spec.json");
  // Include any file referenced by a block's source (eg. styles.css for
  // a cssVar block) so the agent has the complete edit surface.
  for (const b of opts.blocks) {
    if (b.source.file) out.add(b.source.file);
  }
  try {
    const assets = await files.list("assets");
    for (const a of assets) out.add(`assets/${a}`);
  } catch {
    // no assets dir
  }
  return Array.from(out).sort();
}

function describeSource(block: Block): string {
  switch (block.source.tag) {
    case "selector":
      return `${block.source.file} ${block.source.selector}`;
    case "cssVar":
      return `${block.source.file} ${block.source.cssVar}`;
    case "astVar":
      return `${block.source.file} ${block.source.varName}`;
    case "specKey":
      return `${block.source.file}#${block.source.specKey}`;
  }
}

function describeCurrentValue(block: Block): string | null {
  // Prefer the canonical first descriptor's value (matches how
  // adapter-image-template treats canonical keys, and how html-app blocks
  // typically have a single "text"/"src"/"value" property).
  const desc = block.descriptors.find((d) => d.canonical) ?? block.descriptors[0];
  if (!desc) return null;
  const value = block.values[desc.key];
  if (value === undefined || value === "") return null;
  return `${desc.key}=${JSON.stringify(value)}`;
}
