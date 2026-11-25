// The JSON contract of ad-preview, shared by the edge handler and the report's
// ad preview dialog (internal page and share link). The answer carries only
// Meta's preview iframe address, never the token or the ad's other fields.

/** Who asks: a signed-in viewer of the report table, or a share link viewer. */
export type AdPreviewRequest =
  { ad_id: string; table_id: string } | { ad_id: string; share_token: string };

export type AdPreviewError =
  | "invalid_request"
  | "not_found"
  | "preview_unavailable"
  | "method_not_allowed"
  | "internal_error";

export type AdPreviewAnswer = { src: string } | { error: AdPreviewError };

/** Meta's preview iframe page: the only address the dialog ever frames. */
const PREVIEW_ORIGIN = "https://www.facebook.com";
const PREVIEW_PATH = "/ads/api/preview_iframe.php";

/**
 * The address as a Meta ad preview iframe URL, or null for anything else
 * (another host or path, plain http, credentials or a port in the URL).
 */
export function metaPreviewSrc(src: string): string | null {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return null;
  }
  const isPreview =
    url.origin === PREVIEW_ORIGIN &&
    url.pathname === PREVIEW_PATH &&
    !url.username &&
    !url.password &&
    !url.port;
  return isPreview ? url.toString() : null;
}

/** The preview address from an ad-preview answer, or null for anything else. */
export function previewSrcOf(data: unknown): string | null {
  if (!data || typeof data !== "object" || !("src" in data)) {
    return null;
  }
  return typeof data.src === "string" ? metaPreviewSrc(data.src) : null;
}
