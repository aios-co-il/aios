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
import {
  base64ByteLength,
  type ImageLoader,
  loadStoredImage,
  MAX_INLINE_IMAGE_BYTES,
} from "./image-loader.ts";

/** A file Resend downloads by URL, or an image sent inside the message. */
export type EmailSendAttachment =
  { filename: string; path: string } | InlineImageAttachment;

export const MAX_INLINE_IMAGES = 10;

// No download starts once all of an email's downloads together have taken
// this long: an image is optional, so slow storage must not hold the email.
export const EMBED_DEADLINE_MS = 8000;

// The stored-attachment cap plus the image budget: the most attachment bytes a
// message may carry before embedding stops.
export const MAX_MESSAGE_ATTACHMENT_BYTES =
  MAX_TOTAL_ATTACHMENT_BYTES + MAX_INLINE_IMAGE_BYTES;

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
 * The image budget of a message that already carries `fileBytes` of files:
 * the usual budget, or whatever room the files leave, down to none.
 */
export function imageBudgetBesideFiles(fileBytes: number): number {
  const room = MAX_MESSAGE_ATTACHMENT_BYTES - fileBytes;
  return Math.max(0, Math.min(MAX_INLINE_IMAGE_BYTES, room));
}
