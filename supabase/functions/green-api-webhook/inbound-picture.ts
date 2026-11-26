/**
 * The picture of a Green API `imageMessage` (AIO-683), not downloaded yet: Carmen's turn
 * reads it only once the message is going to her brain, and only from Green API's media
 * storage under the receiving instance's own id.
 */
import {
  type Fetcher,
  fetchInboundPicture,
} from "../_shared/carmen/whatsapp-picture/fetch.ts";
import type { InboundPicture } from "../_shared/carmen/whatsapp-picture/turn.ts";

/** The parts of Green API's `messageData` this module reads. */
type GreenMessageData = {
  typeMessage?: unknown;
  fileMessageData?: { downloadUrl?: unknown } | null;
};

/**
 * The picture this message carries, or null when it is not an `imageMessage`. A picture
 * without a download address is still one: its read fails, so Carmen says it was not read.
 */
export function greenApiPicture(
  messageData: GreenMessageData | null | undefined,
  instanceId: string | number,
  fetcher?: Fetcher,
): InboundPicture | null {
  if (messageData?.typeMessage !== "imageMessage") {
    return null;
  }
  const url = messageData.fileMessageData?.downloadUrl;
  const line = {
    provider: "green_api" as const,
    instanceId: String(instanceId),
  };

  return {
    read: () =>
      typeof url === "string" && url !== ""
        ? fetchInboundPicture(url, line, { fetcher })
        : Promise.resolve({ ok: false, refusal: "download_failed" }),
  };
}
