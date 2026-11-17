/** Chooses which storage images an email embeds, and builds its send fields.
 * A remote `<img>` that is missing only shows a broken picture, so embedding
 * must never do worse: the image bytes are downloaded here and travel inside
 * the message, and an image that cannot be downloaded, or that would push the
 * message past a byte budget, stays an ordinary remote image. */
import {
  attachmentUrlPrefix,
  emailAttachmentsForResend,
  MAX_TOTAL_ATTACHMENT_BYTES,
} from "./email-attachments.ts";
import {
  inlineEmailImages,
  type InlineImageAttachment,
  inlineImageUrlPrefixes,
  inlineImageUrls,
  type LoadedImage,
} from "./inline-images.ts";

/** Downloads a stored image as Base64, or null when it cannot be embedded. */
export type ImageLoader = (url: string) => Promise<string | null>;

/** A file Resend downloads by URL, or an image sent inside the message. */
export type EmailSendAttachment =
  { filename: string; path: string } | InlineImageAttachment;

export const MAX_INLINE_IMAGES = 10;

// With the stored-attachment cap this keeps the Base64-encoded message under
// Resend's 40 MB limit.
export const MAX_INLINE_IMAGE_BYTES = 5 * 1024 * 1024;

// The stored-attachment cap plus the image budget: the most attachment bytes a
// message may carry before embedding stops.
export const MAX_MESSAGE_ATTACHMENT_BYTES =
  MAX_TOTAL_ATTACHMENT_BYTES + MAX_INLINE_IMAGE_BYTES;

// The most image bytes one function instance keeps between emails.
const MAX_CACHED_IMAGE_BYTES = 4 * MAX_INLINE_IMAGE_BYTES;

// An image is optional, so a slow storage response must not hold the email:
// one download may take this long, and no download starts once all of an
// email's downloads together have taken EMBED_DEADLINE_MS.
const DOWNLOAD_TIMEOUT_MS = 5000;
export const EMBED_DEADLINE_MS = 8000;

const loadStoredImage = cachedImageLoader(downloadImage);

/**
 * The `html` and `attachments` fields of a broadcast email: the stored file
 * attachments plus the body images embedded from our storage.
 */
export async function emailSendFields(
  html: string,
  storedAttachments: unknown,
  supabaseUrl: string,
  loadImage: ImageLoader = loadStoredImage,
): Promise<{ html: string; attachments: Array<EmailSendAttachment> }> {
  const embedded = await embedStorageImages(html, supabaseUrl, loadImage);
  return {
    html: embedded.html,
    attachments: [
      ...emailAttachmentsForResend(
        storedAttachments,
        attachmentUrlPrefix(supabaseUrl),
      ),
      ...embedded.attachments,
    ],
  };
}

/**
 * Embed the HTML's storage images that download and fit the budget. The rest
 * stay ordinary remote images, exactly as before embedding existed.
 * `budgetBytes` is lowered by callers whose message already carries files;
 * `now` is the clock, replaced in tests.
 */
export async function embedStorageImages(
  html: string,
  supabaseUrl: string,
  loadImage: ImageLoader = loadStoredImage,
  budgetBytes: number = MAX_INLINE_IMAGE_BYTES,
  now: () => number = Date.now,
): Promise<{ html: string; attachments: Array<InlineImageAttachment> }> {
  const candidates = inlineImageUrls(html, inlineImageUrlPrefixes(supabaseUrl));
  const images: Array<LoadedImage> = [];
  let totalBytes = 0;
  const deadline = now() + EMBED_DEADLINE_MS;
  // One at a time, and no further once the message is full or the time is up:
  // a template with many large or slow images must not hold the email.
  for (const url of candidates) {
    const isFull =
      images.length >= MAX_INLINE_IMAGES || totalBytes >= budgetBytes;
    if (isFull || now() >= deadline) {
      break;
    }
    const content = await loadImage(url);
    const bytes = content === null ? 0 : base64ByteLength(content);
    if (content !== null && totalBytes + bytes <= budgetBytes) {
      images.push({ url, content });
      totalBytes += bytes;
    }
  }
  return inlineEmailImages(html, images);
}

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

/** Download an image within the budget; null (and a log line) otherwise. */
async function downloadImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    const declaredBytes = Number(res.headers.get("content-length") ?? 0);
    if (!res.ok || declaredBytes > MAX_INLINE_IMAGE_BYTES) {
      await res.body?.cancel();
      console.warn(`[embed-images] not embedded, status ${res.status}: ${url}`);
      return null;
    }
    return bytesToBase64(new Uint8Array(await res.arrayBuffer()));
  } catch (e) {
    console.warn(`[embed-images] not embedded, download failed: ${url}`, e);
    return null;
  }
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
