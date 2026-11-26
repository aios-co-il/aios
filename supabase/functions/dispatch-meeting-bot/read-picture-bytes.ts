/**
 * Reads the meeting bot's picture from the web app's answer without trusting its size (AIO-668):
 * the function's memory is small, and a worker killed here would leave the bot unsent.
 */
import { RECALL_JPEG_B64_MAX_LENGTH } from "../_shared/recall.ts";

/** The most bytes Recall takes: base64 writes every 3 bytes as 4 characters. */
export const PICTURE_MAX_BYTES = (RECALL_JPEG_B64_MAX_LENGTH / 4) * 3;

/** Every JPEG file starts with these bytes (the SOI marker and the next marker's prefix). */
const JPEG_START = [0xff, 0xd8, 0xff];

/**
 * The answer's body, read up to Recall's limit: a larger one is refused from its declared
 * length, or cancelled once it passes the limit, so it is never held in memory.
 */
export async function readPictureBytes(res: Response): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length"));
  if (declared > PICTURE_MAX_BYTES) {
    await res.body?.cancel();
    throw new Error(`too large for Recall (${declared} bytes declared)`);
  }
  const chunks: Array<Uint8Array> = [];
  let length = 0;

  for await (const chunk of res.body ?? []) {
    length += chunk.length;
    if (length > PICTURE_MAX_BYTES) {
      // Leaving the loop cancels the rest of the body.
      throw new Error(`too large for Recall (over ${PICTURE_MAX_BYTES} bytes)`);
    }
    chunks.push(chunk);
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

/** Whether the bytes start as a JPEG file does. */
export function isJpeg(bytes: Uint8Array): boolean {
  return JPEG_START.every((byte, i) => bytes[i] === byte);
}
