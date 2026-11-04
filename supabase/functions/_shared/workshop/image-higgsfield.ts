/**
 * One still from Higgsfield Soul 2: submit, poll until done, download.
 */

import { type GeminiAspectRatio } from "../creative/geminiImage.ts";
import { accepted, clip } from "./image-errors.ts";
import {
  type ImageDeps,
  type ImageReference,
  type MadeImage,
} from "./image-providers.ts";

const HIGGSFIELD_ASPECTS: Record<string, string> = {
  "1:1": "1:1",
  "16:9": "16:9",
  "9:16": "9:16",
  "4:3": "4:3",
  "3:4": "3:4",
  "4:5": "3:4",
};

/** Soul 2: text-to-image, or image-to-image when there is a public reference link. */
export async function viaHiggsfield(
  key: string,
  prompt: string,
  aspect: GeminiAspectRatio,
  deps: ImageDeps,
  fetchImpl: typeof fetch,
  references: ImageReference[],
): Promise<MadeImage> {
  const base = "https://api.higgsfield.ai";
  const headers = {
    Authorization: `Key ${key}`,
    "Content-Type": "application/json",
  };
  const reference = [...references].reverse().find((entry) => entry.url);
  const submit = await fetchImpl(
    `${base}/higgsfield-ai/soul/v2/${reference ? "image-to-image" : "standard"}`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        prompt,
        aspect_ratio: HIGGSFIELD_ASPECTS[aspect] ?? "1:1",
        resolution: "720p",
        batch_size: 1,
        ...(reference ? { image_url: reference.url } : {}),
      }),
    },
  );
  const started = await submit.json().catch(() => ({}));
  if (!submit.ok || !started?.request_id)
    throw new Error(`${submit.status} ${clip(JSON.stringify(started))}`);
  try {
    return await awaitHiggsfield(
      started.request_id,
      base,
      headers,
      deps,
      fetchImpl,
    );
  } catch (error) {
    throw accepted(error);
  }
}

async function awaitHiggsfield(
  requestId: string,
  base: string,
  headers: Record<string, string>,
  deps: ImageDeps,
  fetchImpl: typeof fetch,
): Promise<MadeImage> {
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const polls = deps.maxPolls ?? 40;
  for (let attempt = 0; attempt < polls; attempt++) {
    await sleep(deps.pollMs ?? 2000);
    const poll = await fetchImpl(
      `${base}/requests/${encodeURIComponent(requestId)}/status`,
      { headers },
    );
    const state = await poll.json().catch(() => ({}));
    if (!poll.ok)
      throw new Error(`${poll.status} ${clip(JSON.stringify(state))}`);
    if (["failed", "nsfw", "canceled"].includes(state.status))
      throw new Error(clip(String(state.error ?? state.status)));
    if (state.status === "completed") {
      const url = state.images?.[0]?.url;
      if (!url) throw new Error("לא הוחזר קישור לתמונה");
      const file = await fetchImpl(url);
      if (!file.ok) throw new Error(`הורדה ${file.status}`);
      return {
        bytes: new Uint8Array(await file.arrayBuffer()),
        mime: file.headers.get("content-type")?.split(";")[0] || "image/png",
        provider: "higgsfield",
      };
    }
  }
  throw new Error("הזמן אזל");
}
