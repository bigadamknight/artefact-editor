/**
 * adapter-image-inpaint — masked-region edits for raw PNGs via FAL gpt-image-2.
 *
 * Manifest model: `entry` is the canonical PNG. Each `applyImageRegion`
 * command snapshots the current entry to `_history/<entry>.v<n>.png` BEFORE
 * overwriting entry with the freshly composited edit. `versions[]` records
 * every snapshot in order, so promoteImageVersion can roll entry back to any
 * prior state.
 */
import sharp from "sharp";
import {
  parseManifest,
  type Adapter,
  type Block,
  type Command,
  type ImageInpaintVersion,
  type Manifest,
  type ProjectFiles,
} from "@artefact-editor/core";
import { compositeWithMask } from "./composite.js";
import { inpaint } from "./fal.js";

export const REGION_BLOCK_ID = "blk_image_region";
const HISTORY_DIR = "_history";

function manifestPath(): string {
  return "manifest.json";
}

async function readManifest(files: ProjectFiles): Promise<Manifest> {
  const raw = await files.read(manifestPath());
  const m = parseManifest(JSON.parse(raw));
  if (m.artefact !== "image-inpaint") {
    throw new Error(`adapter-image-inpaint loaded a non-image-inpaint manifest: ${m.artefact}`);
  }
  return m;
}

async function writeManifest(files: ProjectFiles, manifest: Manifest): Promise<void> {
  await files.write(manifestPath(), JSON.stringify(manifest, null, 2) + "\n");
}

function uint8ToDataUri(bytes: Uint8Array, mime = "image/png"): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

function entryStem(entryFile: string): string {
  return entryFile.replace(/\.png$/i, "");
}

function nextVersionId(existing: ImageInpaintVersion[] | undefined): string {
  const n = (existing?.length ?? 0) + 1;
  return `v${n}`;
}

async function imageDims(bytes: Uint8Array): Promise<{ width: number; height: number }> {
  const meta = await sharp(bytes).metadata();
  if (!meta.width || !meta.height) throw new Error("entry image has no dimensions");
  return { width: meta.width, height: meta.height };
}

async function snapshotAndApplyEdit(
  files: ProjectFiles,
  manifest: Manifest,
  cmd: Extract<Command, { type: "applyImageRegion" }>,
): Promise<Manifest> {
  const entryBytes = await files.readBinary(manifest.entry);
  const maskBytes = Uint8Array.from(Buffer.from(cmd.maskPng, "base64"));
  const { width, height } = await imageDims(entryBytes);

  const refUrls: string[] = [];
  for (const refPath of cmd.refImagePaths ?? []) {
    const refBytes = await files.readBinary(refPath);
    refUrls.push(uint8ToDataUri(refBytes));
  }

  const rawEdit = await inpaint({
    prompt: cmd.prompt,
    imageUrl: uint8ToDataUri(entryBytes),
    maskUrl: uint8ToDataUri(maskBytes),
    refImageUrls: refUrls,
    width,
    height,
  });

  const composited = await compositeWithMask({
    source: entryBytes,
    edited: rawEdit,
    mask: maskBytes,
  });

  // Snapshot what entry was before this edit, so we can revert.
  const versionId = nextVersionId(manifest.versions);
  const stem = entryStem(manifest.entry);
  const versionFile = `${HISTORY_DIR}/${stem}.${versionId}.png`;
  const maskFile = `${HISTORY_DIR}/${stem}.${versionId}.mask.png`;
  await files.writeBinary(versionFile, entryBytes);
  await files.writeBinary(maskFile, maskBytes);

  // Overwrite the canonical entry.
  await files.writeBinary(manifest.entry, composited);

  const version: ImageInpaintVersion = {
    id: versionId,
    ts: new Date().toISOString(),
    prompt: cmd.prompt,
    file: versionFile,
    maskFile,
    refImagePaths: cmd.refImagePaths,
  };
  return { ...manifest, versions: [...(manifest.versions ?? []), version] };
}

async function promote(
  files: ProjectFiles,
  manifest: Manifest,
  cmd: Extract<Command, { type: "promoteImageVersion" }>,
): Promise<Manifest> {
  const versions = manifest.versions ?? [];
  const target = versions.find((v) => v.id === cmd.versionId);
  if (!target) throw new Error(`unknown versionId: ${cmd.versionId}`);
  const versionBytes = await files.readBinary(target.file);
  await files.writeBinary(manifest.entry, versionBytes);
  return manifest;
}

export const imageInpaintAdapter: Adapter = {
  id: "image-inpaint",

  async load(files: ProjectFiles): Promise<{ blocks: Block[]; entryFile: string }> {
    const manifest = await readManifest(files);
    const block: Block = {
      id: REGION_BLOCK_ID,
      kind: "image-region",
      label: manifest.name ?? "Image",
      source: { tag: "entry", file: manifest.entry },
      descriptors: [],
      values: {},
    };
    return { blocks: [block], entryFile: manifest.entry };
  },

  async apply(files: ProjectFiles, _blocks: Block[], commands: Command[]): Promise<void> {
    let manifest = await readManifest(files);
    for (const cmd of commands) {
      if (cmd.type === "applyImageRegion") {
        if (cmd.blockId !== REGION_BLOCK_ID) {
          throw new Error(`unknown blockId: ${cmd.blockId}`);
        }
        manifest = await snapshotAndApplyEdit(files, manifest, cmd);
      } else if (cmd.type === "promoteImageVersion") {
        if (cmd.blockId !== REGION_BLOCK_ID) {
          throw new Error(`unknown blockId: ${cmd.blockId}`);
        }
        manifest = await promote(files, manifest, cmd);
      }
      // setProperty is a no-op for this adapter.
    }
    await writeManifest(files, manifest);
  },
};
