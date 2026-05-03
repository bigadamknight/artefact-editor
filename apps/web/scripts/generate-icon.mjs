#!/usr/bin/env node
/**
 * Generate the artefact-editor PWA icon set.
 *
 * Pipeline:
 *   Imagen 3 (1:1, 1024px master) → sharp (downscale to 512 + 192) → public/
 *
 * Optional follow-up variants (maskable, monochrome) via Gemini 2.5 Flash Image
 * are produced if PROMPT_VARIANTS=1 is set.
 *
 * Run with: GOOGLE_AI_API_KEY=... node apps/web/scripts/generate-icon.mjs [prompt-key]
 */
import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, "..", "public");
const masterPath = join(publicDir, "icon-master.png");

const apiKey = process.env.GOOGLE_AI_API_KEY;
if (!apiKey) {
  console.error("GOOGLE_AI_API_KEY missing");
  process.exit(1);
}

const PROMPTS = {
  blocks:
    "Minimalist app icon for a content editor. A bold, geometric letter 'A' constructed from three stacked rectangular blocks of varying widths, suggesting paragraphs or content modules. Pale slate-blue (#b5cdd9) blocks on a near-black (#0a0a0a) background. Subtle inner glow. Flat vector style, crisp edges, centered composition with generous padding. Designed to read clearly at 64x64.",
  cursor:
    "Minimalist app icon. A simple text-cursor I-beam centered over a content block, both rendered in pale slate-blue (#b5cdd9) on a near-black (#0a0a0a) background. The I-beam pulses with a soft glow. Flat geometric vector style. Square 1:1 with even padding. Designed to read at small sizes.",
  prism:
    "Minimalist app icon. A diamond-shaped prism made of overlapping translucent rectangles in pale slate-blue (#b5cdd9), suggesting layered editable artefacts. Near-black (#0a0a0a) background. Flat geometric vector style, no text, generous padding. Modern, calm, technical aesthetic.",
};

const promptKey = process.argv[2] ?? "blocks";
const prompt = PROMPTS[promptKey];
if (!prompt) {
  console.error(`Unknown prompt: ${promptKey}. Available: ${Object.keys(PROMPTS).join(", ")}`);
  process.exit(1);
}

console.log(`Generating master icon (prompt: ${promptKey})…`);

const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`;
const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    instances: [{ prompt }],
    parameters: { sampleCount: 1, aspectRatio: "1:1" },
  }),
});

if (!res.ok) {
  console.error(`Imagen call failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}

const data = await res.json();
const b64 = data?.predictions?.[0]?.bytesBase64Encoded;
if (!b64) {
  console.error("No image in response:", JSON.stringify(data).slice(0, 500));
  process.exit(1);
}

await mkdir(publicDir, { recursive: true });
const masterBuf = Buffer.from(b64, "base64");
await writeFile(masterPath, masterBuf);
console.log(`  wrote ${masterPath} (${masterBuf.length} bytes)`);

for (const size of [512, 192]) {
  const out = join(publicDir, `icon-${size}.png`);
  await sharp(masterBuf).resize(size, size).png().toFile(out);
  console.log(`  wrote ${out}`);
}

console.log("Done.");
