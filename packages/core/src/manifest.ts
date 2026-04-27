import { z } from "zod";

const sourceSchema = z.union([
  z.object({ file: z.string(), selector: z.string() }),
  z.object({ file: z.string(), cssVar: z.string() }),
  z.object({ file: z.string(), astVar: z.string() }),
]);

const descriptorSchema = z.discriminatedUnion("type", [
  z.object({ key: z.string(), type: z.literal("string"), multiline: z.boolean().optional() }),
  z.object({ key: z.string(), type: z.literal("asset"), mime: z.array(z.string()).optional() }),
  z.object({ key: z.string(), type: z.literal("color") }),
  z.object({
    key: z.string(),
    type: z.literal("number"),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().optional(),
  }),
  z.object({ key: z.string(), type: z.literal("enum"), options: z.array(z.string()) }),
]);

const blockSchema = z.object({
  id: z.string().regex(/^blk_[a-z0-9_]+$/, "Block ID must match blk_<snake_case>"),
  kind: z.enum(["text", "image", "color", "audio", "timing"]),
  label: z.string(),
  source: sourceSchema,
  properties: z.array(descriptorSchema).min(1),
});

export const manifestSchema = z.object({
  version: z.literal(1),
  artefact: z.enum(["html-app", "hyperframes"]),
  entry: z.string(),
  name: z.string().optional(),
  blocks: z.array(blockSchema),
});

export type Manifest = z.infer<typeof manifestSchema>;
export type ManifestBlock = z.infer<typeof blockSchema>;

export function parseManifest(raw: unknown): Manifest {
  const parsed = manifestSchema.parse(raw);
  const ids = new Set<string>();
  for (const block of parsed.blocks) {
    if (ids.has(block.id)) {
      throw new Error(`Duplicate block id: ${block.id}`);
    }
    ids.add(block.id);
    const keys = new Set<string>();
    for (const prop of block.properties) {
      if (keys.has(prop.key)) {
        throw new Error(`Duplicate property key '${prop.key}' in block ${block.id}`);
      }
      keys.add(prop.key);
    }
  }
  return parsed;
}
