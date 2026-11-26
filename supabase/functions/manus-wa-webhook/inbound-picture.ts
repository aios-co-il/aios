/**
 * The picture of a Manus WhatsApp message (AIO-683), not downloaded yet: Carmen's turn reads
 * it only once the message is going to her brain, only from the Manus gateway, with the
 * receiving line's own API key. Voice notes keep their own path (`fetchMedia`).
 */
import {
  type Fetcher,
  fetchInboundPicture,
} from "../_shared/carmen/whatsapp-picture/fetch.ts";
import type { InboundPicture } from "../_shared/carmen/whatsapp-picture/turn.ts";
import { pickAudioUrlFromContainers } from "../_shared/wa-voice-resolve.ts";

/** The parts of a Manus payload this module reads; the gateway's shape varies. */
type ManusPictureFields = {
  hasMedia?: unknown;
  type?: unknown;
  messageType?: unknown;
  mediaType?: unknown;
  mimeType?: unknown;
  mime_type?: unknown;
  media?: unknown;
  file?: unknown;
  attachment?: unknown;
};

/** The message container a Manus payload may wrap its media in. */
type ManusPictureContainer = { imageMessage?: unknown };

/**
 * The picture this message carries, or null when it carries none. A picture without a
 * download address is still one: its read fails, so Carmen says it was not read.
 */
export function manusPicture(
  payload: ManusPictureFields,
  msgContainer: ManusPictureContainer,
  apiKey: string | null | undefined,
  fetcher?: Fetcher,
): InboundPicture | null {
  if (!isPicture(payload, msgContainer)) {
    return null;
  }
  // The same field names voice notes use (`url`, `mediaUrl`, `downloadUrl`, …).
  const url = pickAudioUrlFromContainers([
    msgContainer.imageMessage,
    payload.media,
    payload.file,
    payload.attachment,
    payload,
  ]);
  const headers: Record<string, string> = apiKey ? { "X-Api-Key": apiKey } : {};

  return {
    read: () =>
      url
        ? fetchInboundPicture(
            url,
            { provider: "manus_wa" },
            { headers, fetcher },
          )
        : Promise.resolve({ ok: false, refusal: "download_failed" }),
  };
}

/** Whether the payload says it is a picture: an `imageMessage`, an image type or an image MIME. */
function isPicture(
  payload: ManusPictureFields,
  msgContainer: ManusPictureContainer,
): boolean {
  if (msgContainer.imageMessage) {
    return true;
  }
  if (!payload.hasMedia) {
    return false;
  }
  const type = [payload.type, payload.messageType, payload.mediaType].find(
    (value) => typeof value === "string",
  );
  const mime = [
    payload.mimeType,
    payload.mime_type,
    mimeOf(payload.media),
  ].find((value) => typeof value === "string");

  return (
    type === "image" || (typeof mime === "string" && mime.startsWith("image/"))
  );
}

/** The `mimetype` of a media object, when the payload nests one. */
function mimeOf(media: unknown): unknown {
  return typeof media === "object" && media !== null && "mimetype" in media
    ? media.mimetype
    : undefined;
}
