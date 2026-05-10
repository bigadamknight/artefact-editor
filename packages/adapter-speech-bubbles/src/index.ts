/**
 * adapter-speech-bubbles — declarative bubble overlay layer for picture-book
 * spreads. The entry image (PNG) is treated as immutable canon; bubbles live
 * as a normalized array on the manifest. The adapter writes the entire array
 * on each save (it's small, the editor mutates freely), and dual-writes a
 * sibling `bubbles.json` so the standalone preview tool stays in sync.
 */
import {
  parseManifest,
  type Adapter,
  type Block,
  type Command,
  type Manifest,
  type ProjectFiles,
  type SpeechBubble,
  type SpeechBubbleManifest,
} from "@artefact-editor/core";

export const BUBBLES_BLOCK_ID = "blk_speech_bubbles";
export const SIDECAR_FILE = "bubbles.json";

function manifestPath(): string {
  return "manifest.json";
}

async function readManifest(files: ProjectFiles): Promise<Manifest> {
  const raw = await files.read(manifestPath());
  const m = parseManifest(JSON.parse(raw));
  if (m.artefact !== "speech-bubbles") {
    throw new Error(`adapter-speech-bubbles loaded a non-speech-bubbles manifest: ${m.artefact}`);
  }
  return m;
}

async function writeManifest(files: ProjectFiles, manifest: Manifest): Promise<void> {
  await files.write(manifestPath(), JSON.stringify(manifest, null, 2) + "\n");
}

async function writeSidecar(
  files: ProjectFiles,
  entry: string,
  bubbles: SpeechBubbleManifest[],
): Promise<void> {
  const sidecar = { version: 1, image: entry, bubbles };
  await files.write(SIDECAR_FILE, JSON.stringify(sidecar, null, 2) + "\n");
}

/**
 * Migrate any existing sidecar bubbles.json into the manifest at load time, if
 * the manifest itself has no `bubbles` field. This means a project scaffolded
 * with just a sidecar (e.g. from the standalone preview tool) is picked up
 * without any manual conversion.
 */
async function ensureBubblesPopulated(
  files: ProjectFiles,
  manifest: Manifest,
): Promise<Manifest> {
  if (manifest.bubbles && manifest.bubbles.length > 0) return manifest;
  let raw: string | null = null;
  try {
    raw = await files.read(SIDECAR_FILE);
  } catch {
    return manifest;
  }
  try {
    const parsed = JSON.parse(raw) as { bubbles?: SpeechBubbleManifest[] };
    if (Array.isArray(parsed.bubbles) && parsed.bubbles.length > 0) {
      return { ...manifest, bubbles: parsed.bubbles };
    }
  } catch {
    // Malformed sidecar — leave manifest untouched.
  }
  return manifest;
}

export const speechBubblesAdapter: Adapter = {
  id: "speech-bubbles",

  async load(files: ProjectFiles): Promise<{ blocks: Block[]; entryFile: string }> {
    const manifest = await ensureBubblesPopulated(files, await readManifest(files));
    const block: Block = {
      id: BUBBLES_BLOCK_ID,
      kind: "speech-bubbles",
      label: manifest.name ?? "Speech bubbles",
      source: { tag: "entry", file: manifest.entry },
      descriptors: [],
      values: {},
    };
    return { blocks: [block], entryFile: manifest.entry };
  },

  async apply(files: ProjectFiles, _blocks: Block[], commands: Command[]): Promise<void> {
    let manifest = await readManifest(files);
    let touched = false;
    for (const cmd of commands) {
      if (cmd.type !== "setSpeechBubbles") continue;
      if (cmd.blockId !== BUBBLES_BLOCK_ID) {
        throw new Error(`unknown blockId: ${cmd.blockId}`);
      }
      const bubbles = cmd.bubbles as SpeechBubble[];
      manifest = { ...manifest, bubbles };
      touched = true;
    }
    if (!touched) return;
    await writeManifest(files, manifest);
    await writeSidecar(files, manifest.entry, manifest.bubbles ?? []);
  },
};
