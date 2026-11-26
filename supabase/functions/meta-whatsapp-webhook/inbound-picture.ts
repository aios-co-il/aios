/**
 * The picture of a Meta Cloud API `image` message (AIO-683), not downloaded yet: Carmen's
 * turn reads it only once the message is going to her brain. The Graph API names the file
 * by its media id and Meta's media host serves it, both read with the receiving number's
 * own token.
 */
import { MAX_PICTURE_BYTES } from "../run-ai-agent/attachments/contract.ts";
import {
  type Fetcher,
  fetchAllowed,
  fetchInboundPicture,
  type PictureFetchRefusal,
  type PictureFetchResult,
} from "../_shared/carmen/whatsapp-picture/fetch.ts";
import { META_GRAPH_HOST } from "../_shared/carmen/whatsapp-picture/media-host.ts";
import type { InboundPicture } from "../_shared/carmen/whatsapp-picture/turn.ts";
import type { Db } from "../_shared/workshop/db.ts";
import {
  DEFAULT_META_GRAPH_VERSION,
  type MetaWhatsAppMessage,
} from "../_shared/meta-whatsapp.ts";

/** The receiving number, as the webhook knows it: its token is read only when the picture is. */
export type MetaPictureLine = {
  /** The line's access token, or null when it has none. */
  token: () => Promise<string | null>;
  /** The Graph API version the line's settings name, if any. */
  graphVersion?: unknown;
};

const META_LINE = { provider: "meta_whatsapp" as const };

/** The receiving number's own access token, read with the service client; null when it has none. */
export async function metaLineToken(
  admin: Db,
  integrationId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("meta_whatsapp_tokens")
    .select("access_token")
    .eq("integration_id", integrationId)
    .maybeSingle();
  if (error) {
    console.error("[whatsapp-picture] Meta token not read", error);
    return null;
  }
  return typeof data?.access_token === "string" ? data.access_token : null;
}

/** The picture this message carries, or null when it is not an `image` message. */
export function metaPicture(
  message: MetaWhatsAppMessage,
  line: MetaPictureLine,
  fetcher?: Fetcher,
): InboundPicture | null {
  if (message.type !== "image") {
    return null;
  }
  const mediaId = message.image?.id;

  return {
    read: () =>
      typeof mediaId === "string" && /^\d{1,32}$/.test(mediaId)
        ? readMetaPicture(mediaId, line, fetcher)
        : Promise.resolve({ ok: false, refusal: "download_failed" }),
  };
}

/** Asks the Graph API where the file is, then downloads it from Meta's media host. */
async function readMetaPicture(
  mediaId: string,
  line: MetaPictureLine,
  fetcher?: Fetcher,
): Promise<PictureFetchResult> {
  const token = await line.token();
  if (!token) {
    console.warn("[whatsapp-picture] Meta line has no token");
    return { ok: false, refusal: "download_failed" };
  }
  const headers = { Authorization: `Bearer ${token}` };
  const media = await mediaInfo(mediaId, graphVersionOf(line.graphVersion), {
    headers,
    fetcher,
  });
  if ("refusal" in media) {
    return { ok: false, refusal: media.refusal };
  }
  if (media.size > MAX_PICTURE_BYTES) {
    return { ok: false, refusal: "too_large" };
  }

  return await fetchInboundPicture(media.url, META_LINE, { headers, fetcher });
}

/** The file's address and declared size from the Graph API's media object. */
async function mediaInfo(
  mediaId: string,
  graphVersion: string,
  options: { headers: Record<string, string>; fetcher?: Fetcher },
): Promise<{ url: string; size: number } | { refusal: PictureFetchRefusal }> {
  const answer = await fetchAllowed(
    `https://${META_GRAPH_HOST}/${graphVersion}/${mediaId}`,
    META_LINE,
    options,
  );
  if ("refusal" in answer) {
    return answer;
  }
  const body: unknown = await answer.response.json().catch(() => null);
  const url =
    typeof body === "object" && body !== null && "url" in body
      ? body.url
      : null;
  const size =
    typeof body === "object" && body !== null && "file_size" in body
      ? Number(body.file_size)
      : 0;

  return typeof url === "string"
    ? { url, size }
    : { refusal: "download_failed" };
}

/** The line's Graph API version when it reads as one (`v25.0`), else the default. */
function graphVersionOf(raw: unknown): string {
  return typeof raw === "string" && /^v\d{1,3}\.\d{1,3}$/.test(raw)
    ? raw
    : DEFAULT_META_GRAPH_VERSION;
}
