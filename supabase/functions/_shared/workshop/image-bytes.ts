/**
 * Picture bytes for the image providers: reading the type from the first bytes, base64 both
 * ways, and downloading the reference pictures a request sends along.
 */

import { type ImageReference } from "./image-providers.ts";

const REFERENCE_MIMES = ["image/jpeg", "image/png", "image/webp"];
const REFERENCE_MAX_BYTES = 12 * 1024 * 1024;

/**
 * Downloads reference images. Pictures that cannot be read are reported, never skipped silently:
 * a result that ignores the reference is the failure this exists to prevent.
 */
export async function loadReferences(
  urls: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<{ references: ImageReference[]; failed: string[] }> {
  const references: ImageReference[] = [];
  const failed: string[] = [];
  await Promise.all(
    urls.map(async (url, index) => {
      try {
        const response = await fetchImpl(url);
        if (!response.ok) throw new Error(String(response.status));
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length === 0 || bytes.length > REFERENCE_MAX_BYTES)
          throw new Error("size");
        const mime =
          sniffMime(bytes) ??
          response.headers.get("content-type")?.split(";")[0].trim() ??
          "";
        if (!REFERENCE_MIMES.includes(mime)) throw new Error("type");
        references[index] = { bytes, mime, url };
      } catch {
        failed.push(url);
      }
    }),
  );
  return { references: references.filter(Boolean), failed };
}

export const sniffMime = (bytes: Uint8Array) =>
  bytes[0] === 0x89 && bytes[1] === 0x50
    ? "image/png"
    : bytes[0] === 0xff && bytes[1] === 0xd8
      ? "image/jpeg"
      : bytes[0] === 0x52 && bytes[8] === 0x57
        ? "image/webp"
        : null;

export const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
};

/** A plain loop: Uint8Array.from with a callback costs far more CPU on a picture-sized string. */
export const fromBase64 = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
};
