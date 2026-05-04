import { serve } from "@hono/node-server";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { spawn } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Doc, type Adapter, type Block, type Command } from "@artefact-editor/core";
import { htmlAdapter, previewBridgeScript } from "@artefact-editor/adapter-html";
import { imageTemplateAdapter, SPEC_FILE_DEFAULT } from "@artefact-editor/adapter-image-template";
import { FsProjectFiles } from "./projectFiles.js";
import { isInside } from "./paths.js";
import { runChild } from "./runChild.js";
import {
  addComment,
  buildApplyPrompt,
  deleteComment,
  listSourceFiles,
  readComments,
} from "./comments.js";
import { createCommentRequestSchema } from "@artefact-editor/contract";

const PYTHON_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_.]*$/;

interface ManifestMeta {
  name?: string;
  artefact: "html-app" | "hyperframes" | "image-template";
  template?: string;
  specFile?: string;
}

interface ProjectState {
  id: string;
  root: string;
  files: FsProjectFiles;
  manifest: ManifestMeta | null;
  adapter: Adapter;
  blocks: Block[];
  entry: string;
  name: string;
}

const here = dirname(fileURLToPath(import.meta.url));
// apps/cli/src → apps/cli → apps → repo
const repoRoot = resolve(here, "..", "..", "..");

function pickAdapter(artefact: ManifestMeta["artefact"] | undefined): Adapter {
  if (artefact === "image-template") return imageTemplateAdapter;
  return htmlAdapter;
}

async function loadProject(root: string): Promise<ProjectState | null> {
  const files = new FsProjectFiles(root);
  let manifest: ManifestMeta | null = null;
  try {
    const raw = await files.read("manifest.json");
    manifest = JSON.parse(raw) as ManifestMeta;
  } catch {
    return null;
  }
  const adapter = pickAdapter(manifest.artefact);
  const { blocks, entryFile } = await adapter.load(files);
  const id = basename(root);
  return {
    id,
    root,
    files,
    manifest,
    adapter,
    blocks,
    entry: entryFile,
    name: manifest.name ?? id,
  };
}

async function discoverDefaultProjects(): Promise<string[]> {
  const examplesDir = resolve(repoRoot, "examples");
  try {
    const entries = await readdir(examplesDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => resolve(examplesDir, e.name));
    const checks = await Promise.allSettled(
      dirs.map((d) => stat(resolve(d, "manifest.json"))),
    );
    return dirs.filter((_, i) => checks[i]!.status === "fulfilled");
  } catch {
    return [];
  }
}

const argPaths = process.argv.slice(2);
const projectPaths =
  argPaths.length > 0
    ? argPaths.map((p) => resolve(p))
    : await discoverDefaultProjects();

if (projectPaths.length === 0) {
  console.error("Usage: artefact-editor <project-dir> [<project-dir> ...]");
  console.error("(or run from the repo root with bundled examples/)");
  process.exit(1);
}

const projects = new Map<string, ProjectState>();
const loaded = await Promise.all(projectPaths.map((p) => loadProject(p).catch(() => null)));
for (let i = 0; i < projectPaths.length; i++) {
  const p = projectPaths[i]!;
  const state = loaded[i];
  if (!state) {
    console.warn(`[artefact-editor] skipped (no manifest.json or load error): ${p}`);
    continue;
  }
  if (projects.has(state.id)) {
    console.warn(`[artefact-editor] duplicate project id ${state.id}, keeping first`);
    continue;
  }
  projects.set(state.id, state);
  console.log(
    `[artefact-editor] loaded "${state.name}" (${state.id}): ${state.blocks.length} blocks; entry=${state.entry}; artefact=${state.manifest?.artefact ?? "html-app"}`,
  );
}

if (projects.size === 0) {
  console.error("[artefact-editor] no valid projects found");
  process.exit(1);
}

async function reloadProject(id: string): Promise<void> {
  const existing = projects.get(id);
  if (!existing) return;
  const next = await loadProject(existing.root);
  if (next) projects.set(id, next);
}

const app = new Hono();
app.use("*", cors());

// List all projects — used by the home page to render the picker.
app.get("/api/projects", (c) => {
  return c.json({
    projects: Array.from(projects.values()).map((p) => ({
      id: p.id,
      name: p.name,
      artefact: p.manifest?.artefact ?? "html-app",
      entry: p.entry,
    })),
  });
});

app.get("/api/projects/:id", async (c) => {
  const id = c.req.param("id");
  const p = projects.get(id);
  if (!p) return c.json({ error: "not found" }, 404);

  let previewStale = false;
  if (p.manifest?.artefact === "image-template") {
    const specFile = p.manifest.specFile ?? SPEC_FILE_DEFAULT;
    try {
      const [specStat, outStat] = await Promise.all([
        stat(resolve(p.root, specFile)),
        stat(resolve(p.root, p.entry)),
      ]);
      previewStale = specStat.mtimeMs > outStat.mtimeMs;
    } catch {
      previewStale = true;
    }
  }
  return c.json({
    id: p.id,
    name: p.name,
    root: p.root,
    entry: p.entry,
    blocks: p.blocks,
    artefact: p.manifest?.artefact ?? "html-app",
    previewStale,
  });
});

interface SaveBody {
  commands: Command[];
}

app.post("/api/projects/:id/save", async (c) => {
  const id = c.req.param("id");
  const p = projects.get(id);
  if (!p) return c.json({ ok: false, error: "not found" }, 404);

  const body = (await c.req.json()) as SaveBody;
  if (!Array.isArray(body.commands)) {
    return c.json({ ok: false, error: "commands must be an array" }, 400);
  }

  const doc = new Doc(p.blocks.map((b) => ({ ...b, values: { ...b.values } })));
  for (const cmd of body.commands) doc.apply(cmd);

  // Net commands = touched (block, key) pairs whose final value differs from
  // the original. Tracking touched keys (rather than scanning every dirty
  // block's full value map) avoids O(N*M) work on large blocks.
  const touchedByBlock = new Map<string, Set<string>>();
  for (const cmd of body.commands) {
    if (cmd.type !== "setProperty") continue;
    let keys = touchedByBlock.get(cmd.blockId);
    if (!keys) {
      keys = new Set();
      touchedByBlock.set(cmd.blockId, keys);
    }
    keys.add(cmd.key);
  }
  const originalById = new Map(p.blocks.map((b) => [b.id, b]));
  const settledCommands: Command[] = [];
  for (const [blockId, keys] of touchedByBlock) {
    const final = doc.getBlock(blockId);
    const original = originalById.get(blockId);
    if (!final || !original) continue;
    for (const key of keys) {
      const value = final.values[key];
      if (value !== undefined && original.values[key] !== value) {
        settledCommands.push({ type: "setProperty", blockId, key, value });
      }
    }
  }

  if (settledCommands.length === 0) {
    return c.json({ ok: true, changed: 0 });
  }

  await p.adapter.apply(p.files, p.blocks, settledCommands);
  await reloadProject(id);
  return c.json({ ok: true, changed: settledCommands.length });
});

app.post("/api/projects/:id/render", async (c) => {
  const id = c.req.param("id");
  const p = projects.get(id);
  if (!p) return c.json({ ok: false, error: "not found" }, 404);

  if (p.manifest?.artefact === "image-template") {
    return renderImageTemplate(c, p);
  }
  if (p.manifest?.artefact === "hyperframes") {
    return renderHyperframes(c, p);
  }
  return c.json({ ok: false, error: "render not supported for this artefact type" }, 400);
});

async function renderImageTemplate(c: Context, p: ProjectState) {
  const template = p.manifest!.template;
  if (!template) {
    return c.json({ ok: false, error: "manifest.template is required for render" }, 400);
  }
  const specFile = p.manifest!.specFile ?? SPEC_FILE_DEFAULT;
  const out = p.entry;

  const lastDot = template.lastIndexOf(".");
  if (lastDot < 0) return c.json({ ok: false, error: `template must be 'module.Class', got: ${template}` }, 400);
  const modulePath = template.slice(0, lastDot);
  const className = template.slice(lastDot + 1);
  // modulePath/className are interpolated into a python -c script; even though
  // the manifest is author-controlled, validate to keep the contract narrow
  // (no shell metacharacters, no unicode confusables, no dotted paths starting
  // with a digit).
  if (!PYTHON_IDENTIFIER.test(modulePath) || !PYTHON_IDENTIFIER.test(className)) {
    return c.json({ ok: false, error: `invalid template '${template}': module/class must match ${PYTHON_IDENTIFIER}` }, 400);
  }

  const py = `
import os, sys, json
sys.path.insert(0, os.path.expanduser("~/.claude/skills"))
sys.path.insert(0, os.path.expanduser("~/.claude/skills/image-template"))
from templates.${modulePath} import ${className}
from templates.base import TemplateData
spec = json.load(open(${JSON.stringify(specFile)}))
import dataclasses
allowed = {f.name for f in dataclasses.fields(TemplateData)}
data = TemplateData(**{k: v for k, v in spec.items() if k in allowed})
${className}(data).save(${JSON.stringify(out)})
print("rendered", ${JSON.stringify(out)})
`;

  try {
    const r = await runChild("python3", ["-c", py], { cwd: p.root });
    if (r.code === 0) return c.json({ ok: true, stdout: r.stdout.trim() });
    return c.json(
      { ok: false, error: r.stderr.trim() || `python exited ${r.code}`, stdout: r.stdout.trim() },
      500,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: `failed to spawn python3: ${message}` }, 500);
  }
}

async function renderHyperframes(c: Context, p: ProjectState) {
  // Stable filename inside the project's renders/ dir. Each invocation
  // overwrites it — the editor's "open rendered MP4" flow can rely on a
  // predictable URL. For final delivery users still have the timestamped
  // versions in renders/ from CLI use.
  const outRel = "renders/editor-render.mp4";
  const args = ["hyperframes", "render", "--quality", "draft", "--output", outRel];

  try {
    const r = await runChild("npx", args, { cwd: p.root, env: process.env });
    if (r.code === 0) {
      return c.json({
        ok: true,
        output: outRel,
        previewUrl: `/preview/${p.id}/${outRel}`,
        stdout: r.stdout.trim().slice(-2000),
      });
    }
    return c.json(
      {
        ok: false,
        error: r.stderr.trim().slice(-2000) || `npx hyperframes render exited ${r.code}`,
        stdout: r.stdout.trim().slice(-2000),
      },
      500,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: `failed to spawn npx: ${message}` }, 500);
  }
}

// Stream a zip archive of the project (manifest + source + assets, minus
// build artefacts). Mirrors img.ly's `.cesdk` self-contained format — a
// shareable single file you can drop into another machine's
// artefact-editor and pick up where you left off.
app.get("/api/projects/:id/archive", async (c) => {
  const id = c.req.param("id");
  const p = projects.get(id);
  if (!p) return c.text("Not found", 404);

  // Excludes: editor outputs, transient build state, version-control noise.
  // node_modules in case someone has run yarn inside an example dir.
  const excludes = [
    "node_modules/*",
    "renders/editor-render.mp4",
    "renders/*.tmp.*",
    ".thumbnails/*",         // hyperframes-cli scratch
    ".hyperframes-cache/*",  // ditto
    ".DS_Store",
    "*.log",
    ".vite/*",
    "dist/*",
    ".git/*",
  ];
  const args = ["-r", "-q", "-", "."];
  for (const x of excludes) args.push("-x", x);

  const child = spawn("zip", args, { cwd: p.root });
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      child.stdout.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      child.stderr.on("data", (chunk: Buffer) => console.error("[zip]", chunk.toString()));
      child.on("close", () => controller.close());
      child.on("error", (err) => controller.error(err));
    },
    cancel() {
      child.kill();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${id}.artefact"`,
    },
  });
});

app.get("/api/projects/:id/assets", async (c) => {
  const id = c.req.param("id");
  const p = projects.get(id);
  if (!p) return c.json({ assets: [] }, 404);
  const list = await p.files.list("assets");
  const allowed = list.filter((f) => /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(f));
  return c.json({ assets: allowed.map((f) => `assets/${f}`) });
});

app.get("/api/projects/:id/comments", async (c) => {
  const id = c.req.param("id");
  const p = projects.get(id);
  if (!p) return c.json({ comments: [] }, 404);
  const comments = await readComments(p.files);
  return c.json({ comments });
});

app.post("/api/projects/:id/comments", async (c) => {
  const id = c.req.param("id");
  const p = projects.get(id);
  if (!p) return c.json({ error: "not found" }, 404);
  const parse = createCommentRequestSchema.safeParse(await c.req.json());
  if (!parse.success) return c.json({ error: parse.error.message }, 400);
  const knownIds = new Set(p.blocks.map((b) => b.id));
  if (!knownIds.has(parse.data.blockId)) {
    return c.json({ error: `unknown blockId: ${parse.data.blockId}` }, 400);
  }
  const comment = await addComment(p.files, parse.data.blockId, parse.data.text);
  return c.json({ comment });
});

app.delete("/api/projects/:id/comments/:commentId", async (c) => {
  const id = c.req.param("id");
  const commentId = c.req.param("commentId");
  const p = projects.get(id);
  if (!p) return c.json({ ok: false, error: "not found" }, 404);
  const ok = await deleteComment(p.files, commentId);
  if (!ok) return c.json({ ok: false, error: "comment not found" }, 404);
  return c.json({ ok: true });
});

app.post("/api/projects/:id/comments/apply", async (c) => {
  const id = c.req.param("id");
  const p = projects.get(id);
  if (!p) return c.json({ ok: false, error: "not found" }, 404);
  const all = await readComments(p.files);
  const pending = all.filter((cm) => cm.status === "pending");
  if (pending.length === 0) {
    return c.json({ ok: false, error: "no pending comments", prompt: "", comments: [], sourceFiles: [] });
  }
  const sourceFiles = await listSourceFiles(p.files, {
    entry: p.entry,
    specFile: p.manifest?.specFile,
    artefact: p.manifest?.artefact ?? "html-app",
    blocks: p.blocks,
  });
  const prompt = buildApplyPrompt({
    projectName: p.name,
    artefact: p.manifest?.artefact ?? "html-app",
    blocks: p.blocks,
    comments: pending,
    sourceFiles,
  });
  return c.json({ ok: true, prompt, comments: pending, sourceFiles });
});

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".json": "application/json; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

app.get("/preview/:id/*", async (c) => {
  const id = c.req.param("id");
  const p = projects.get(id);
  if (!p) return c.text("Not found", 404);
  const url = new URL(c.req.url);
  let rel = url.pathname.replace(new RegExp(`^/preview/${id}/?`), "");
  if (!rel) rel = p.entry;
  const abs = resolve(p.root, rel);
  if (!isInside(resolve(p.root), abs)) {
    return c.text("Forbidden", 403);
  }
  try {
    const s = await stat(abs);
    if (!s.isFile()) return c.text("Not found", 404);
  } catch {
    return c.text("Not found", 404);
  }
  const ext = extname(abs).toLowerCase();
  const mime = MIME[ext] ?? "application/octet-stream";
  const buf = await readFile(abs);
  if (ext === ".html" && p.manifest?.artefact !== "image-template") {
    const html = buf.toString("utf8");
    const tag = `<script>${previewBridgeScript}</script>`;
    // Most authored pages have </body>; some fragments / minified bundles
    // don't. Fall back to appending so the bridge always loads.
    const injected = /<\/body>/i.test(html)
      ? html.replace(/<\/body>/i, `${tag}</body>`)
      : html + tag;
    return c.body(injected, 200, { "content-type": mime });
  }
  return c.body(buf as unknown as ArrayBuffer, 200, { "content-type": mime });
});

// Serve the built web bundle from /. When running via `yarn dev` this is
// skipped — Vite owns localhost:5173 and proxies /api + /preview here. When
// running standalone (`artefact-editor <dir>`), the user hits this server
// directly and we hand them the editor SPA.
const webDist = resolve(here, "..", "..", "web", "dist");
let webDistExists = false;
try {
  const s = await stat(webDist);
  webDistExists = s.isDirectory();
} catch {
  webDistExists = false;
}

if (webDistExists) {
  app.get("/*", async (c) => {
    const url = new URL(c.req.url);
    let rel = url.pathname.replace(/^\//, "");
    if (!rel) rel = "index.html";
    const abs = resolve(webDist, rel);
    if (!isInside(resolve(webDist), abs)) return c.text("Forbidden", 403);
    let buf: Buffer;
    try {
      buf = await readFile(abs);
    } catch {
      buf = await readFile(resolve(webDist, "index.html"));
      return c.body(buf as unknown as ArrayBuffer, 200, { "content-type": "text/html; charset=utf-8" });
    }
    const ext = extname(abs).toLowerCase();
    const mime = MIME[ext] ?? "application/octet-stream";
    return c.body(buf as unknown as ArrayBuffer, 200, { "content-type": mime });
  });
} else {
  app.get("/", (c) =>
    c.text(
      "artefact-editor: web bundle not found at " + webDist +
      "\nRun `yarn build` from the repo root, or use `yarn dev` for HMR (Vite at :5173).",
      503,
    ),
  );
}

function parsePort(env: string | undefined, fallback: number): number {
  if (env == null) return fallback;
  const n = Number(env);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    console.warn(`[artefact-editor] PORT='${env}' is not a valid port; falling back to ${fallback}`);
    return fallback;
  }
  return n;
}
const port = parsePort(process.env.PORT, 7411);
serve({ fetch: app.fetch, port }, ({ port: p }) => {
  const url = `http://localhost:${p}`;
  if (webDistExists) {
    console.log(`[artefact-editor] editor: ${url}`);
  } else {
    console.log(`[artefact-editor] api: ${url}  (web bundle not built — see ${url}/ for help)`);
  }
});
