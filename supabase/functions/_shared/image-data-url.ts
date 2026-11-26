/**
 * A picture's bytes as the inline `data:` address a vision model reads: the type comes from
 * the bytes themselves, never from a file name or a client's word. One helper for every
 * caller that sends a picture inside a chat request.
 */
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

/** The picture types a chat model takes inline. */
export type InlineImageMime =
  "image/jpeg" | "image/png" | "image/webp" | "image/gif";

/** The bytes each type's file starts with; `at` is where they sit. */
const SIGNATURES: Array<{
  mime: InlineImageMime;
  parts: Array<{ at: number; bytes: Array<number> }>;
}> = [
  { mime: "image/jpeg", parts: [{ at: 0, bytes: [0xff, 0xd8, 0xff] }] },
  {
    mime: "image/png",
    parts: [{ at: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
  },
  {
    // "RIFF", four bytes of size, then "WEBP".
    mime: "image/webp",
    parts: [
      { at: 0, bytes: [0x52, 0x49, 0x46, 0x46] },
      { at: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
    ],
  },
  // "GIF8": both GIF87a and GIF89a.
  { mime: "image/gif", parts: [{ at: 0, bytes: [0x47, 0x49, 0x46, 0x38] }] },
];

/** The types by the names a person knows them by ("JPEG", "PNG", …). */
export const INLINE_IMAGE_TYPE_NAMES: Array<string> = SIGNATURES.map(
  ({ mime }) => mime.slice("image/".length).toUpperCase(),
);

/** The picture type these bytes start as, or null when they are not one of the four. */
export function sniffImageMime(bytes: Uint8Array): InlineImageMime | null {
  const match = SIGNATURES.find(({ parts }) =>
    parts.every((part) =>
      part.bytes.every((byte, offset) => bytes[part.at + offset] === byte),
    ),
  );

  return match?.mime ?? null;
}

/** The bytes as a base64 `data:` address of the given type. */
export function imageDataUrl(bytes: Uint8Array, mime: InlineImageMime): string {
  return `data:${mime};base64,${encodeBase64(bytes)}`;
}
