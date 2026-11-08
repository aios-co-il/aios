// Zod reader for the media fields of a chat message's raw_provider_data
// (Manus / Green API shapes).
import { z } from "npm:zod@3.25.76";

const text = z
  .union([z.string(), z.number(), z.boolean()])
  .transform((value) => (value ? String(value) : undefined))
  .optional()
  .catch(undefined);

const mediaMessageSchema = z.object({ url: text, mimetype: text }).catch({});

const EMPTY_MESSAGE = { imageMessage: {}, videoMessage: {} };

const rawMediaSchema = z
  .object({
    media_url: text,
    mediaUrl: text,
    url: text,
    file_url: text,
    fileUrl: text,
    downloadUrl: text,
    downloadURL: text,
    mime_type: text,
    mimeType: text,
    caption: text,
    text: text,
    message: z
      .object({
        imageMessage: mediaMessageSchema,
        videoMessage: mediaMessageSchema,
        caption: text,
      })
      .catch(EMPTY_MESSAGE),
  })
  .catch({ message: EMPTY_MESSAGE });

export function pickMediaFromRaw(raw: unknown): {
  url?: string;
  mime?: string;
  caption?: string;
} {
  const data = rawMediaSchema.parse(raw);
  const { message } = data;
  const image = message.imageMessage;
  const video = message.videoMessage;
  const url =
    data.media_url ||
    data.mediaUrl ||
    data.url ||
    data.file_url ||
    data.fileUrl ||
    image.url ||
    video.url ||
    data.downloadUrl ||
    data.downloadURL;
  const mime =
    data.mime_type || data.mimeType || image.mimetype || video.mimetype;
  const caption = data.caption || message.caption || data.text;
  return { url, mime, caption };
}
