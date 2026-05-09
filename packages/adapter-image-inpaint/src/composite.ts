/**
 * Composite a model edit back over the original under a feathered mask, so
 * unmasked pixels stay byte-stable. GPT Image 2 rewrites the whole canvas
 * even with a mask supplied; this step pins everything outside the mask back
 * to the source, with a Gaussian-feathered seam to hide the boundary.
 */
import sharp from "sharp";

export interface CompositeInput {
  /** Original PNG bytes. */
  source: Uint8Array;
  /** Model output PNG bytes (may be drifted across the whole frame). */
  edited: Uint8Array;
  /** Mask PNG bytes — white=repaint, black=preserve. Will be resized to source dims. */
  mask: Uint8Array;
  /** Feather radius in pixels. Default 12. */
  featherRadius?: number;
}

export async function compositeWithMask(input: CompositeInput): Promise<Uint8Array> {
  const featherRadius = input.featherRadius ?? 12;
  const meta = await sharp(input.source).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) throw new Error("source image has no dimensions");

  // Normalise the mask: ensure same size, single channel, blurred edges.
  const featheredMask = await sharp(input.mask)
    .resize(width, height, { fit: "fill" })
    .toColorspace("b-w")
    .blur(featherRadius)
    .toBuffer();

  // Bring the edited image to source dimensions, attach the mask as alpha.
  const editedWithAlpha = await sharp(input.edited)
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .joinChannel(featheredMask)
    .toBuffer();

  // Composite over the source: alpha-blended, so unmasked = source pixel.
  const out = await sharp(input.source)
    .composite([{ input: editedWithAlpha, blend: "over" }])
    .png()
    .toBuffer();
  return new Uint8Array(out);
}
