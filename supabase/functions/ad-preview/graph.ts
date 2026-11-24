/**
 * Reads an ad's mobile feed preview from Meta's Graph API. The token goes in
 * the Authorization header, never the URL, so no transport error or log line
 * can carry it.
 */
import { redactSyncError } from "../_shared/ads-sync/redact.ts";
import { metaPreviewSrc } from "./contract.ts";

const GRAPH_VERSION = "v21.0";
const AD_FORMAT = "MOBILE_FEED_STANDARD";

/** Meta answered with an error or without a usable preview; its message is redacted. */
export class AdPreviewGraphError extends Error {
  constructor(message: string) {
    super(redactSyncError(message));
    this.name = "AdPreviewGraphError";
  }
}

/** The ad's preview iframe address; throws AdPreviewGraphError when Meta gives none. */
export async function fetchMetaPreviewSrc(
  fetchImpl: typeof fetch,
  token: string,
  adId: string,
): Promise<string> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${adId}/previews?ad_format=${AD_FORMAT}`;
  const response = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new AdPreviewGraphError(
      `Graph ${response.status}: ${JSON.stringify(payload)}`,
    );
  }
  const body = firstPreviewBody(payload);
  const src = body ? metaPreviewSrc(iframeSrcOf(body) ?? "") : null;
  if (!src) {
    throw new AdPreviewGraphError(
      `Graph preview without a Meta iframe: ${JSON.stringify(payload)}`,
    );
  }
  return src;
}

/** The `body` HTML of the first preview in a Graph previews answer. */
function firstPreviewBody(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || !("data" in payload)) {
    return null;
  }
  const first: unknown = Array.isArray(payload.data) ? payload.data[0] : null;
  if (!first || typeof first !== "object" || !("body" in first)) {
    return null;
  }
  return typeof first.body === "string" ? first.body : null;
}

/** The src attribute of the iframe tag, with its HTML entities decoded. */
function iframeSrcOf(html: string): string | null {
  const match = html.match(/<iframe\b[^>]*?\bsrc\s*=\s*(["'])(.*?)\1/i);
  return match ? decodeEntities(match[2]) : null;
}

/** The entities Meta escapes in an attribute value (`&amp;` between query parameters). */
function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
