/**
 * Minimal FAL queue-API client for the gpt-image-2 edit endpoint. Direct
 * `fetch` rather than the FAL SDK so the adapter has zero runtime deps beyond
 * sharp.
 *
 * Submission docs: https://docs.fal.ai/serverless/queue-api
 * Endpoint:        https://fal.ai/models/fal-ai/gpt-image-2/edit/api
 */

const API_BASE = "https://queue.fal.run";
const ENDPOINT = "fal-ai/gpt-image-2/edit";

interface SubmitResponse {
  request_id: string;
  status_url: string;
  response_url: string;
}

interface ResultPayload {
  images: Array<{ url: string; content_type?: string }>;
}

function apiKey(): string {
  const k = process.env.FAL_API_KEY ?? process.env.FAL_KEY;
  if (!k) {
    throw new Error(
      "FAL_API_KEY (or FAL_KEY) not set. Get a key at https://fal.ai/dashboard/keys",
    );
  }
  return k;
}

async function poll(statusUrl: string, responseUrl: string): Promise<ResultPayload> {
  const key = apiKey();
  const start = Date.now();
  const TIMEOUT_MS = 10 * 60 * 1000;
  while (Date.now() - start < TIMEOUT_MS) {
    const r = await fetch(statusUrl, { headers: { Authorization: `Key ${key}` } });
    if (!r.ok) throw new Error(`status poll failed ${r.status}: ${await r.text()}`);
    const body = (await r.json()) as { status: string };
    if (body.status === "COMPLETED") {
      const finalRes = await fetch(responseUrl, { headers: { Authorization: `Key ${key}` } });
      if (!finalRes.ok) throw new Error(`response fetch failed ${finalRes.status}`);
      return (await finalRes.json()) as ResultPayload;
    }
    if (body.status === "FAILED" || body.status === "CANCELLED") {
      throw new Error(`fal request ${body.status}: ${JSON.stringify(body)}`);
    }
    await new Promise((res) => setTimeout(res, 1500));
  }
  throw new Error("fal request timed out after 10 minutes");
}

export interface InpaintInput {
  /** Source image as data URI or https URL. */
  imageUrl: string;
  /** Mask as data URI: white = repaint, black = preserve. */
  maskUrl: string;
  /** Optional reference images (additional context for the model). */
  refImageUrls?: string[];
  prompt: string;
  width: number;
  height: number;
  /** "low" | "medium" | "high" — default "high". */
  quality?: "low" | "medium" | "high";
}

/** Calls gpt-image-2 edit, returns the raw result PNG bytes. */
export async function inpaint(input: InpaintInput): Promise<Uint8Array> {
  const key = apiKey();
  const submitRes = await fetch(`${API_BASE}/${ENDPOINT}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${key}`,
    },
    body: JSON.stringify({
      prompt: input.prompt,
      image_urls: [input.imageUrl, ...(input.refImageUrls ?? [])],
      mask_url: input.maskUrl,
      image_size: { width: input.width, height: input.height },
      quality: input.quality ?? "high",
      output_format: "png",
    }),
  });
  if (!submitRes.ok) {
    throw new Error(`fal submit failed ${submitRes.status}: ${await submitRes.text()}`);
  }
  const submit = (await submitRes.json()) as SubmitResponse;

  const result = await poll(submit.status_url, submit.response_url);
  const url = result.images?.[0]?.url;
  if (!url) throw new Error(`fal response missing image url: ${JSON.stringify(result)}`);

  if (url.startsWith("data:")) {
    const comma = url.indexOf(",");
    return Uint8Array.from(Buffer.from(url.slice(comma + 1), "base64"));
  }
  const imgRes = await fetch(url);
  if (!imgRes.ok) throw new Error(`failed to download fal image ${imgRes.status}`);
  return new Uint8Array(await imgRes.arrayBuffer());
}
