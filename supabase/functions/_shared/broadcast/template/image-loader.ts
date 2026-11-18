/** Downloads storage images for embedding in email, and remembers them.
 * An image is optional: whatever goes wrong here, the caller gets null and
 * sends the email with an ordinary remote image. */

/** Downloads a stored image as Base64, or null when it cannot be embedded. */
export type ImageLoader = (url: string) => Promise<string | null>;

// With the stored-attachment cap (email-attachments.ts) this keeps the
// Base64-encoded message under Resend's 40 MB limit.
export const MAX_INLINE_IMAGE_BYTES = 5 * 1024 * 1024;

// The most image bytes one function instance keeps between emails.
const MAX_CACHED_IMAGE_BYTES = 4 * MAX_INLINE_IMAGE_BYTES;

// A slow storage response must not hold the email.
const DOWNLOAD_TIMEOUT_MS = 5000;

/** The loader edge functions use: downloads from storage, cached per instance. */
export const loadStoredImage: ImageLoader = cachedImageLoader((url) =>
  downloadImage(url),
);

/**
 * Remember each downloaded image for the function instance: one broadcast
 * sends the same template to every recipient. Only successes are kept, so an
 * image that failed once is tried again by the next email, and the oldest
 * images are dropped once the kept ones pass `maxCachedBytes`.
 */
export function cachedImageLoader(
  download: ImageLoader,
  maxCachedBytes: number = MAX_CACHED_IMAGE_BYTES,
): ImageLoader {
  const pendingByUrl = new Map<string, Promise<string | null>>();
  const contentByUrl = new Map<string, string>();
  let cachedBytes = 0;

  /** Keep a downloaded image, dropping the oldest ones to stay in bounds. */
  function remember(url: string, content: string): void {
    contentByUrl.set(url, content);
    cachedBytes += base64ByteLength(content);
    for (const [oldUrl, oldContent] of contentByUrl) {
      if (cachedBytes <= maxCachedBytes) {
        break;
      }
      contentByUrl.delete(oldUrl);
      cachedBytes -= base64ByteLength(oldContent);
    }
  }

  return (url) => {
    const known = contentByUrl.get(url);
    if (known !== undefined) {
      return Promise.resolve(known);
    }
    // Emails prepared at the same moment share one download.
    const pending =
      pendingByUrl.get(url) ??
      download(url)
        .then((content) => {
          if (content !== null) {
            remember(url, content);
          }
          return content;
        })
        .finally(() => pendingByUrl.delete(url));
    pendingByUrl.set(url, pending);
    return pending;
  };
}

/**
 * Download an image within the size and time limits; null (and a log line)
 * otherwise. `fetchImage` and `timeoutMs` are replaced in tests.
 */
export async function downloadImage(
  url: string,
  fetchImage: typeof fetch = fetch,
  timeoutMs: number = DOWNLOAD_TIMEOUT_MS,
): Promise<string | null> {
  try {
    const res = await fetchImage(url, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    const bytes = res.ok ? await readWithinLimit(res) : null;
    if (bytes === null) {
      await res.body?.cancel();
      console.warn(`[image-loader] not embedded, status ${res.status}: ${url}`);
      return null;
    }
    return bytesToBase64(bytes);
  } catch (e) {
    console.warn(`[image-loader] not embedded, download failed: ${url}`, e);
    return null;
  }
}

/**
 * The response body, or null once it passes the image budget. The size is
 * counted while reading, because a content-length header can be absent.
 */
async function readWithinLimit(res: Response): Promise<Uint8Array | null> {
  const chunks: Array<Uint8Array> = [];
  let total = 0;
  for await (const chunk of res.body ?? []) {
    total += chunk.length;
    if (total > MAX_INLINE_IMAGE_BYTES) {
      return null;
    }
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

/** Base64 of raw bytes, built in chunks so large images do not overflow the stack. */
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Number of raw bytes a Base64 string decodes to. */
export function base64ByteLength(content: string): number {
  const padding = content.endsWith("==") ? 2 : content.endsWith("=") ? 1 : 0;
  return (content.length / 4) * 3 - padding;
}
