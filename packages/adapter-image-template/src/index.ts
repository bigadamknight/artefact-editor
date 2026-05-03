import {
  parseManifest,
  type Adapter,
  type Block,
  type Command,
  type ProjectFiles,
  type PropertyDescriptor,
  type PropertyValue,
} from "@artefact-editor/core";

export const SPEC_FILE_DEFAULT = "spec.json";

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
  await files.write(specFile, JSON.stringify(spec, Object.keys(spec).sort(), 2) + "\n");
}

/**
 * Each spec-key block maps to exactly one spec key. When a block has multiple
 * descriptors, one must be marked `canonical: true` to disambiguate which
 * value gets written to the spec. Single-descriptor blocks default to that
 * sole descriptor.
 */
function canonicalDescriptor(blockId: string, descriptors: PropertyDescriptor[]): PropertyDescriptor {
  const marked = descriptors.filter((d) => d.canonical);
  if (marked.length > 1) {
    throw new Error(`block ${blockId} has multiple descriptors marked canonical`);
  }
  if (marked.length === 1) return marked[0]!;
  if (descriptors.length === 1) return descriptors[0]!;
  throw new Error(
    `block ${blockId} has ${descriptors.length} descriptors; one must set canonical: true`,
  );
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
      const canonical = canonicalDescriptor(mb.id, descriptors);
      const values: Record<string, PropertyValue> = {};
      const current = spec[mb.source.specKey];
      for (const desc of descriptors) {
        if (desc.key === canonical.key && current !== undefined) {
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
    const byFile = new Map<string, Map<string, PropertyValue>>();
    const blocksById = new Map(blocks.map((b) => [b.id, b]));

    for (const cmd of commands) {
      if (cmd.type !== "setProperty") continue;
      const block = blocksById.get(cmd.blockId);
      if (!block) throw new Error(`Unknown block: ${cmd.blockId}`);
      if (block.source.tag !== "specKey") {
        throw new Error(`block ${block.id} is not a specKey block; adapter-image-template can't apply`);
      }
      const canonical = canonicalDescriptor(block.id, block.descriptors);
      if (cmd.key !== canonical.key) continue;

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
