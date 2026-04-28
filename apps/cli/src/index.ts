import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Doc, type Adapter, type Block, type Command } from "@artefact-editor/core";
import { htmlAdapter, previewBridgeScript } from "@artefact-editor/adapter-html";
import { imageTemplateAdapter } from "@artefact-editor/adapter-image-template";
import { FsProjectFiles } from "./projectFiles.js";

const projectArg = process.argv[2];
if (!projectArg) {
  console.error("Usage: artefact-editor <project-dir>");
  process.exit(1);
}
const projectRoot = resolve(projectArg);
console.log(`[artefact-editor] project: ${projectRoot}`);

const files = new FsProjectFiles(projectRoot);

interface ManifestMeta {
  name?: string;
  artefact: "html-app" | "hyperframes" | "image-template";
  template?: string;
  specFile?: string;
}

let cachedBlocks: Block[] = [];
let cachedEntry = "index.html";
let cachedManifestName: string | undefined;
let cachedAdapter: Adapter = htmlAdapter;
let cachedManifest: ManifestMeta | null = null;

function pickAdapter(artefact: ManifestMeta["artefact"]): Adapter {
  if (artefact === "image-template") return imageTemplateAdapter;
  return htmlAdapter;
}

async function reloadProject(): Promise<void> {
  // Read manifest to discover artefact type before loading via adapter.
  let manifest: ManifestMeta | null = null;
  try {
    const raw = await files.read("manifest.json");
    manifest = JSON.parse(raw) as ManifestMeta;
  } catch {
    manifest = null;
  }
  cachedManifest = manifest;
  cachedManifestName = manifest?.name;
  cachedAdapter = manifest ? pickAdapter(manifest.artefact) : htmlAdapter;

  const { blocks, entryFile } = await cachedAdapter.load(files);
  cachedBlocks = blocks;
  cachedEntry = entryFile;
  console.log(
    `[artefact-editor] loaded ${blocks.length} blocks; entry=${entryFile}; artefact=${manifest?.artefact ?? "html-app"}`,
  );
}

await reloadProject();

const app = new Hono();
app.use("*", cors());

app.get("/api/project", async (c) => {
  let previewStale = false;
  if (cachedManifest?.artefact === "image-template") {
    const specFile = cachedManifest.specFile ?? "spec.json";
    try {
      const [specStat, outStat] = await Promise.all([
        stat(resolve(projectRoot, specFile)),
        stat(resolve(projectRoot, cachedEntry)),
      ]);
      previewStale = specStat.mtimeMs > outStat.mtimeMs;
    } catch {
      // If output.png doesn't exist yet, the preview is definitely stale.
      previewStale = true;
    }
  }
  return c.json({
    name: cachedManifestName ?? "Project",
    root: projectRoot,
    entry: cachedEntry,
    blocks: cachedBlocks,
    artefact: cachedManifest?.artefact ?? "html-app",
    previewStale,
  });
});

interface SaveBody {
  commands: Command[];
}

app.post("/api/save", async (c) => {
  const body = (await c.req.json()) as SaveBody;
  if (!Array.isArray(body.commands)) {
    return c.json({ ok: false, error: "commands must be an array" }, 400);
  }

  // Apply against a Doc for validation/dedup, then write via adapter.
  const doc = new Doc(cachedBlocks.map((b) => ({ ...b, values: { ...b.values } })));
  for (const cmd of body.commands) doc.apply(cmd);

  const dirtyIds = new Set(doc.dirtyIds());
  const dirtyBlocks = doc.getBlocks().filter((b) => dirtyIds.has(b.id));
  const settledCommands: Command[] = dirtyBlocks.flatMap((b) =>
    Object.entries(b.values).map(([key, value]) => {
      const original = cachedBlocks.find((x) => x.id === b.id);
      if (original && original.values[key] === value) return null;
      return { type: "setProperty" as const, blockId: b.id, key, value };
    }).filter((x): x is Command => x !== null),
  );

  if (settledCommands.length === 0) {
    return c.json({ ok: true, changed: 0 });
  }

  await cachedAdapter.apply(files, cachedBlocks, settledCommands);
  await reloadProject();
  return c.json({ ok: true, changed: settledCommands.length });
});

app.post("/api/render", async (c) => {
  if (!cachedManifest || cachedManifest.artefact !== "image-template") {
    return c.json({ ok: false, error: "render only available for image-template artefacts" }, 400);
  }
  const template = cachedManifest.template;
  if (!template) {
    return c.json({ ok: false, error: "manifest.template is required for render" }, 400);
  }
  const specFile = cachedManifest.specFile ?? "spec.json";
  const out = cachedEntry; // typically output.png

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
# Filter to fields the dataclass accepts so manifests can carry extra metadata.
import dataclasses
allowed = {f.name for f in dataclasses.fields(TemplateData)}
data = TemplateData(**{k: v for k, v in spec.items() if k in allowed})
${className}(data).save(${JSON.stringify(out)})
print("rendered", ${JSON.stringify(out)})
`;

  return new Promise<Response>((resolveRes) => {
    const child = spawn("python3", ["-c", py], { cwd: projectRoot });
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

app.get("/api/assets", async (c) => {
  const list = await files.list("assets");
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

app.get("/preview/*", async (c) => {
  const url = new URL(c.req.url);
  let rel = url.pathname.replace(/^\/preview\/?/, "");
  if (!rel) rel = cachedEntry;
  const abs = resolve(projectRoot, rel);
  if (!abs.startsWith(resolve(projectRoot))) {
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
  if (ext === ".html" && cachedManifest?.artefact !== "image-template") {
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
const here = dirname(fileURLToPath(import.meta.url));
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
    // Prevent escaping webDist via crafted paths.
    if (!abs.startsWith(resolve(webDist))) return c.text("Forbidden", 403);
    let buf: Buffer;
    try {
      buf = await readFile(abs);
    } catch {
      // SPA fallback — unknown route → index.html, the React router takes over.
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
