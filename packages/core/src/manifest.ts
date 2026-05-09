import { z } from "zod";

const sourceSchema = z.union([
  z.object({ file: z.string(), selector: z.string() }),
  z.object({ file: z.string(), cssVar: z.string() }),
  z.object({ file: z.string(), astVar: z.string() }),
  z.object({ file: z.string(), specKey: z.string() }),
]);

const descriptorSchema = z.discriminatedUnion("type", [
  z.object({
    key: z.string(),
    type: z.literal("string"),
    multiline: z.boolean().optional(),
    canonical: z.boolean().optional(),
  }),
  z.object({
    key: z.string(),
    type: z.literal("asset"),
    mime: z.array(z.string()).optional(),
    canonical: z.boolean().optional(),
  }),
  z.object({ key: z.string(), type: z.literal("color"), canonical: z.boolean().optional() }),
  z.object({
    key: z.string(),
    type: z.literal("number"),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().optional(),
    canonical: z.boolean().optional(),
  }),
  z.object({
    key: z.string(),
    type: z.literal("enum"),
    options: z.array(z.string()),
    canonical: z.boolean().optional(),
  }),
]);

const blockSchema = z.object({
  id: z.string().regex(/^blk_[a-z0-9_]+$/, "Block ID must match blk_<snake_case>"),
  kind: z.enum(["text", "image", "color", "audio", "timing"]),
  label: z.string(),
  source: sourceSchema,
  properties: z.array(descriptorSchema).min(1),
});

const imageInpaintVersionSchema = z.object({
  id: z.string(),
  ts: z.string(),
  prompt: z.string(),
  file: z.string(),
  maskFile: z.string(),
  refImagePaths: z.array(z.string()).optional(),
});

export const manifestSchema = z.object({
  version: z.literal(1),
  artefact: z.enum(["html-app", "hyperframes", "image-template", "editframe", "image-inpaint"]),
  entry: z.string(),
  name: z.string().optional(),
  /**
   * For image-template artefacts: Python module + class to invoke for the
   * render. Format: "<module_path>.<ClassName>" (e.g. "og_image.OGImage").
   */
  template: z.string().optional(),
  /** For image-template artefacts: path to the spec.json with the kwargs. */
  specFile: z.string().optional(),
  /**
   * For image-inpaint artefacts: ordered history of masked-region edits.
   * Adapter appends on each apply; promote/revert mutate this list.
   */
  versions: z.array(imageInpaintVersionSchema).optional(),
  /**
   * For image-inpaint artefacts: project-relative paths the editor offers as
   * optional reference images alongside any prompt (e.g. character canons).
   */
  referenceImages: z.array(z.string()).optional(),
  blocks: z.array(blockSchema).default([]),
});

export type ImageInpaintVersion = z.infer<typeof imageInpaintVersionSchema>;

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
