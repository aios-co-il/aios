/**
 * Downloads one inbound WhatsApp picture from its provider (AIO-683): only from an address
 * `pictureUrlProblem` allows for the receiving line, redirects included, within the size the
 * brain is sent, and accepted only when the bytes themselves are a picture.
 */
import { MAX_PICTURE_BYTES } from "../../../run-ai-agent/attachments/contract.ts";
import { type InlineImageMime, sniffImageMime } from "../../image-data-url.ts";
import { type PictureLine, pictureUrlProblem } from "./media-host.ts";

/** The `fetch` this module calls; tests pass a fake. */
export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/** Why a picture was not downloaded. */
export type PictureFetchRefusal =
  "host_not_allowed" | "download_failed" | "too_large" | "not_a_picture";

export type PictureFetchResult =
  | { ok: true; bytes: Uint8Array; mime: InlineImageMime }
  | { ok: false; refusal: PictureFetchRefusal };

/** A provider that redirects more often than this is not followed further. */
const MAX_REDIRECTS = 2;
/** How long one request may take before it is given up, in milliseconds. */
const REQUEST_TIMEOUT_MS = 15_000;

/** The picture at `url`, read for this line with the line's own `headers`. Never rejects. */
export async function fetchInboundPicture(
  url: string,
  line: PictureLine,
  options: { headers?: Record<string, string>; fetcher?: Fetcher } = {},
): Promise<PictureFetchResult> {
  const response = await fetchAllowed(url, line, options);
  if ("refusal" in response) {
    return { ok: false, refusal: response.refusal };
  }
  const bytes = await readCapped(response.response, MAX_PICTURE_BYTES);
  if ("refusal" in bytes) {
    return { ok: false, refusal: bytes.refusal };
  }
  const mime = sniffImageMime(bytes.bytes);

  return mime
    ? { ok: true, bytes: bytes.bytes, mime }
    : { ok: false, refusal: "not_a_picture" };
}

/**
 * A successful response from an allowed address. Redirects are followed by hand, each
 * target checked like the first address, so a provider host cannot hand the server on to
 * another host. The line's headers go only to allowed hosts. Never rejects.
 */
export async function fetchAllowed(
  url: string,
  line: PictureLine,
  options: { headers?: Record<string, string>; fetcher?: Fetcher } = {},
): Promise<{ response: Response } | { refusal: PictureFetchRefusal }> {
  const fetcher = options.fetcher ?? fetch;
  let target = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const problem = pictureUrlProblem(target, line);
    if (problem) {
      console.warn(
        `[whatsapp-picture] address refused (${problem}): ${hostOf(target)}`,
      );
      return { refusal: "host_not_allowed" };
    }
    let response: Response;
    try {
      response = await fetcher(target, {
        headers: options.headers,
        redirect: "manual",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (cause) {
      console.warn(
        `[whatsapp-picture] download failed: ${hostOf(target)}: ${errorKind(cause)}`,
      );
      return { refusal: "download_failed" };
    }
    const next = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && next) {
      await response.body?.cancel();
      target = new URL(next, target).toString();
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      console.warn(
        `[whatsapp-picture] download failed: ${hostOf(target)}: HTTP ${response.status}`,
      );
      return { refusal: "download_failed" };
    }
    return { response };
  }
  console.warn(`[whatsapp-picture] too many redirects: ${hostOf(url)}`);
  return { refusal: "download_failed" };
}

/**
 * The body, read only up to `max` bytes: a declared length over it is never downloaded,
 * and a body that keeps coming past it is cut off, so a huge file never fills the worker.
 */
async function readCapped(
  response: Response,
  max: number,
): Promise<{ bytes: Uint8Array } | { refusal: PictureFetchRefusal }> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > max || !response.body) {
    await response.body?.cancel();
    return { refusal: declared > max ? "too_large" : "download_failed" };
  }
  const reader = response.body.getReader();
  const chunks: Array<Uint8Array> = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.length;
      if (total > max) {
        await reader.cancel();
        return { refusal: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { refusal: "download_failed" };
  }

  return { bytes: joined(chunks, total) };
}

/** The chunks as one array of `total` bytes. */
function joined(chunks: Array<Uint8Array>, total: number): Uint8Array {
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return bytes;
}

/** An error's kind for a log line: its message may quote the signed address. */
function errorKind(cause: unknown): string {
  return cause instanceof Error ? cause.name : "error";
}

/** The host of an address, for a log line: never its path or query, which may be signed. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "(not a url)";
  }
}
