import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { Doc, type Block, type Command } from "@artefact-editor/core";
import { htmlAdapter, previewBridgeScript } from "@artefact-editor/adapter-html";
import { FsProjectFiles } from "./projectFiles.js";

const projectArg = process.argv[2];
if (!projectArg) {
  console.error("Usage: artefact-editor <project-dir>");
  process.exit(1);
}
const projectRoot = resolve(projectArg);
console.log(`[artefact-editor] project: ${projectRoot}`);

const files = new FsProjectFiles(projectRoot);

let cachedBlocks: Block[] = [];
let cachedEntry = "index.html";
let cachedManifestName: string | undefined;

async function reloadProject(): Promise<void> {
  const { blocks, entryFile } = await htmlAdapter.load(files);
  cachedBlocks = blocks;
  cachedEntry = entryFile;
  try {
    const raw = await files.read("manifest.json");
    const m = JSON.parse(raw) as { name?: string };
    cachedManifestName = m.name;
  } catch {
    cachedManifestName = undefined;
  }
  console.log(`[artefact-editor] loaded ${blocks.length} blocks; entry=${entryFile}`);
}

await reloadProject();

const app = new Hono();
app.use("*", cors());

app.get("/api/project", (c) => {
  return c.json({
    name: cachedManifestName ?? "Project",
    root: projectRoot,
    entry: cachedEntry,
    blocks: cachedBlocks,
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

  await htmlAdapter.apply(files, cachedBlocks, settledCommands);
  await reloadProject();
  return c.json({ ok: true, changed: settledCommands.length });
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
  if (ext === ".html") {
    const html = buf.toString("utf8");
    const injected = html.replace(
      /<\/body>/i,
      `<script>${previewBridgeScript}</script></body>`,
    );
    return c.body(injected, 200, { "content-type": mime });
  }
  return c.body(buf as unknown as ArrayBuffer, 200, { "content-type": mime });
});

const port = Number(process.env.PORT ?? 7411);
serve({ fetch: app.fetch, port }, ({ port: p }) => {
  console.log(`[artefact-editor] server listening on http://localhost:${p}`);
});
