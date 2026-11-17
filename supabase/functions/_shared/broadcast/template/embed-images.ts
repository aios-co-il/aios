/** Chooses which storage images an email embeds, and builds its send fields.
 * A remote `<img>` that is missing only shows a broken picture, so embedding
 * must never do worse: the image bytes are downloaded here and travel inside
 * the message, and an image that cannot be downloaded, or that would push the
 * message past a byte budget, stays an ordinary remote image. */
import {
  attachmentUrlPrefix,
  emailAttachmentsForResend,
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

// With the 20 MB stored-attachment cap (email-attachments.ts) this keeps the
// Base64-encoded message under Resend's 40 MB limit.
export const MAX_INLINE_IMAGE_BYTES = 5 * 1024 * 1024;

// One broadcast sends the same template to every recipient, so each image is
// downloaded once per function instance, not once per email. The copy is the
// bytes themselves, so deleting the file later cannot fail a send.
const contentByUrl = new Map<string, Promise<string | null>>();

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
 */
export async function embedStorageImages(
  html: string,
  supabaseUrl: string,
  loadImage: ImageLoader = loadStoredImage,
): Promise<{ html: string; attachments: Array<InlineImageAttachment> }> {
  const candidates = inlineImageUrls(html, inlineImageUrlPrefixes(supabaseUrl));
  const contents = await Promise.all(candidates.map((url) => loadImage(url)));
  const images: Array<LoadedImage> = [];
  let totalBytes = 0;
  candidates.forEach((url, index) => {
    const content = contents[index];
    if (content === null || images.length >= MAX_INLINE_IMAGES) {
      return;
    }
    const bytes = base64ByteLength(content);
    if (totalBytes + bytes <= MAX_INLINE_IMAGE_BYTES) {
      images.push({ url, content });
      totalBytes += bytes;
    }
  });
  return inlineEmailImages(html, images);
}

/** A stored image's Base64 content, remembered for the function instance. */
function loadStoredImage(url: string): Promise<string | null> {
  const known = contentByUrl.get(url);
  if (known) {
    return known;
  }
  const download = downloadImage(url);
  contentByUrl.set(url, download);
  return download;
}

/** Download an image within the budget; null (and a log line) otherwise. */
async function downloadImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
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
function base64ByteLength(content: string): number {
  const padding = content.endsWith("==") ? 2 : content.endsWith("=") ? 1 : 0;
  return (content.length / 4) * 3 - padding;
}
