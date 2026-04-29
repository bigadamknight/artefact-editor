import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { spawn } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Doc, type Adapter, type Block, type Command } from "@artefact-editor/core";
import { htmlAdapter, previewBridgeScript } from "@artefact-editor/adapter-html";
import { imageTemplateAdapter } from "@artefact-editor/adapter-image-template";
import { FsProjectFiles } from "./projectFiles.js";

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
    const withManifest: string[] = [];
    for (const d of dirs) {
      try {
        await stat(resolve(d, "manifest.json"));
        withManifest.push(d);
      } catch {
        // skip dirs without manifest.json
      }
    }
    return withManifest;
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
for (const p of projectPaths) {
  const state = await loadProject(p);
  if (!state) {
    console.warn(`[artefact-editor] skipped (no manifest.json): ${p}`);
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
    const specFile = p.manifest.specFile ?? "spec.json";
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

  const dirtyIds = new Set(doc.dirtyIds());
  const dirtyBlocks = doc.getBlocks().filter((b) => dirtyIds.has(b.id));
  const settledCommands: Command[] = dirtyBlocks.flatMap((b) =>
    Object.entries(b.values).map(([key, value]) => {
      const original = p.blocks.find((x) => x.id === b.id);
      if (original && original.values[key] === value) return null;
      return { type: "setProperty" as const, blockId: b.id, key, value };
    }).filter((x): x is Command => x !== null),
  );

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

  if (!p.manifest || p.manifest.artefact !== "image-template") {
    return c.json({ ok: false, error: "render only available for image-template artefacts" }, 400);
  }
  const template = p.manifest.template;
  if (!template) {
    return c.json({ ok: false, error: "manifest.template is required for render" }, 400);
  }
  const specFile = p.manifest.specFile ?? "spec.json";
  const out = p.entry;

  const lastDot = template.lastIndexOf(".");
  if (lastDot < 0) return c.json({ ok: false, error: `template must be 'module.Class', got: ${template}` }, 400);
  const modulePath = template.slice(0, lastDot);
  const className = template.slice(lastDot + 1);

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

  return new Promise<Response>((resolveRes) => {
    const child = spawn("python3", ["-c", py], { cwd: p.root });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => {
      if (code === 0) {
        resolveRes(c.json({ ok: true, stdout: stdout.trim() }));
      } else {
        resolveRes(
          c.json({ ok: false, error: stderr.trim() || `python exited ${code}`, stdout: stdout.trim() }, 500),
        );
      }
    });
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
};

app.get("/preview/:id/*", async (c) => {
  const id = c.req.param("id");
  const p = projects.get(id);
  if (!p) return c.text("Not found", 404);
  const url = new URL(c.req.url);
  let rel = url.pathname.replace(new RegExp(`^/preview/${id}/?`), "");
  if (!rel) rel = p.entry;
  const abs = resolve(p.root, rel);
  if (!abs.startsWith(resolve(p.root))) {
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
    const injected = html.replace(
      /<\/body>/i,
      `<script>${previewBridgeScript}</script></body>`,
    );
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
    if (!abs.startsWith(resolve(webDist))) return c.text("Forbidden", 403);
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

const port = Number(process.env.PORT ?? 7411);
serve({ fetch: app.fetch, port }, ({ port: p }) => {
  const url = `http://localhost:${p}`;
  if (webDistExists) {
    console.log(`[artefact-editor] editor: ${url}`);
  } else {
    console.log(`[artefact-editor] api: ${url}  (web bundle not built — see ${url}/ for help)`);
  }
});
