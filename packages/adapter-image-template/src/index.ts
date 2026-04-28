import {
  parseManifest,
  type Adapter,
  type Block,
  type Command,
  type ProjectFiles,
  type PropertyDescriptor,
  type PropertyValue,
} from "@artefact-editor/core";

const SPEC_FILE_DEFAULT = "spec.json";

async function readSpec(files: ProjectFiles, specFile: string): Promise<Record<string, PropertyValue>> {
  if (!(await files.exists(specFile))) return {};
  try {
    return JSON.parse(await files.read(specFile));
  } catch {
    return {};
  }
}

async function writeSpec(
  files: ProjectFiles,
  specFile: string,
  spec: Record<string, PropertyValue>,
): Promise<void> {
  // Stable key order: insertion order is preserved by JSON.stringify in modern
  // engines, so we sort keys to keep diffs reviewable.
  const ordered: Record<string, PropertyValue> = {};
  for (const k of Object.keys(spec).sort()) ordered[k] = spec[k]!;
  await files.write(specFile, JSON.stringify(ordered, null, 2) + "\n");
}

export const imageTemplateAdapter: Adapter = {
  id: "image-template",

  async load(files: ProjectFiles): Promise<{ blocks: Block[]; entryFile: string }> {
    const raw = await files.read("manifest.json");
    const manifest = parseManifest(JSON.parse(raw));
    if (manifest.artefact !== "image-template") {
      throw new Error(`adapter-image-template loaded a non-image-template manifest: ${manifest.artefact}`);
    }
    const specFile = manifest.specFile ?? SPEC_FILE_DEFAULT;
    const spec = await readSpec(files, specFile);

    const blocks: Block[] = manifest.blocks.map((mb) => {
      if (!("specKey" in mb.source)) {
        throw new Error(
          `block ${mb.id} on image-template artefact must use specKey source, got: ${JSON.stringify(mb.source)}`,
        );
      }
      const descriptors: PropertyDescriptor[] = [...mb.properties];
      const values: Record<string, PropertyValue> = {};
      const current = spec[mb.source.specKey];
      // Each block has one canonical property whose key is "value" by convention,
      // OR matches the existing prop key. We initialise the first prop with the
      // current spec value; additional props (rare) start empty.
      for (const desc of mb.properties) {
        if (desc.key === mb.properties[0]!.key && current !== undefined) {
          values[desc.key] = current;
        } else {
          values[desc.key] = "";
        }
      }
      return {
        id: mb.id,
        kind: mb.kind,
        label: mb.label,
        source: { tag: "specKey", file: mb.source.file, specKey: mb.source.specKey },
        descriptors,
        values,
      };
    });

    return { blocks, entryFile: manifest.entry };
  },

  async apply(files: ProjectFiles, blocks: Block[], commands: Command[]): Promise<void> {
    if (commands.length === 0) return;
    // Group writes per file (different blocks may target different specs in
    // theory, though typically all share spec.json).
    const byFile = new Map<string, Map<string, PropertyValue>>();
    const blocksById = new Map(blocks.map((b) => [b.id, b]));

    for (const cmd of commands) {
      if (cmd.type !== "setProperty") continue;
      const block = blocksById.get(cmd.blockId);
      if (!block) throw new Error(`Unknown block: ${cmd.blockId}`);
      if (block.source.tag !== "specKey") {
        throw new Error(`block ${block.id} is not a specKey block; adapter-image-template can't apply`);
      }
      // Only apply the canonical (first) property of the block to the spec.
      // Each block maps to exactly one spec key.
      const canonicalKey = block.descriptors[0]!.key;
      if (cmd.key !== canonicalKey) continue;

      let edits = byFile.get(block.source.file);
      if (!edits) {
        edits = new Map();
        byFile.set(block.source.file, edits);
      }
      edits.set(block.source.specKey, cmd.value);
    }

    for (const [file, edits] of byFile) {
      const spec = await readSpec(files, file);
      for (const [k, v] of edits) {
        spec[k] = v;
      }
      await writeSpec(files, file, spec);
    }
  },
};
