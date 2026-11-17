/** Chooses which storage images an email embeds, and builds its send fields.
 * An embedded image is downloaded by Resend when it sends: a missing file or
 * an oversized message would fail the whole email, where a remote `<img>`
 * only shows a broken picture. So an image is embedded only after its size is
 * known, and only while the message stays within a byte budget. */
import {
  attachmentUrlPrefix,
  emailAttachmentsForResend,
} from "./email-attachments.ts";
import {
  inlineEmailImages,
  type InlineImageAttachment,
  inlineImageUrlPrefixes,
  inlineImageUrls,
} from "./inline-images.ts";

/** Byte size of a stored image, or null when it cannot be fetched. */
export type ImageSizeLookup = (url: string) => Promise<number | null>;

export const MAX_INLINE_IMAGES = 10;

// With the 20 MB stored-attachment cap (email-attachments.ts) this keeps the
// Base64-encoded message under Resend's 40 MB limit.
export const MAX_INLINE_IMAGE_BYTES = 5 * 1024 * 1024;

// One broadcast sends the same template to every recipient, so each image is
// looked up once per function instance, not once per email.
const sizeByUrl = new Map<string, Promise<number | null>>();

/**
 * The `html` and `attachments` fields of a broadcast email: the stored file
 * attachments plus the body images embedded from our storage.
 */
export async function emailSendFields(
  html: string,
  storedAttachments: unknown,
  supabaseUrl: string,
  imageSize: ImageSizeLookup = storedImageSize,
): Promise<{
  html: string;
  attachments: Array<{ filename: string; path: string; content_id?: string }>;
}> {
  const embedded = await embedStorageImages(html, supabaseUrl, imageSize);
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
 * Embed the HTML's storage images that exist and fit the budget. The rest
 * stay ordinary remote images, exactly as before embedding existed.
 */
export async function embedStorageImages(
  html: string,
  supabaseUrl: string,
  imageSize: ImageSizeLookup = storedImageSize,
): Promise<{ html: string; attachments: Array<InlineImageAttachment> }> {
  const candidates = inlineImageUrls(html, inlineImageUrlPrefixes(supabaseUrl));
  const sizes = await Promise.all(candidates.map((url) => imageSize(url)));
  const embedUrls: Array<string> = [];
  let totalBytes = 0;
  candidates.forEach((url, index) => {
    const size = sizes[index];
    const fits =
      size !== null &&
      embedUrls.length < MAX_INLINE_IMAGES &&
      totalBytes + size <= MAX_INLINE_IMAGE_BYTES;
    if (fits) {
      embedUrls.push(url);
      totalBytes += size;
    }
  });
  return inlineEmailImages(html, embedUrls);
}

/** Size of an image in our storage, remembered for the function instance. */
function storedImageSize(url: string): Promise<number | null> {
  const known = sizeByUrl.get(url);
  if (known) {
    return known;
  }
  const lookup = headImageSize(url);
  sizeByUrl.set(url, lookup);
  return lookup;
}

/** Ask storage for the image's size; null (and a log line) when it is not there. */
async function headImageSize(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    const size = Number(res.headers.get("content-length"));
    if (res.ok && Number.isFinite(size) && size > 0) {
      return size;
    }
    console.warn(`[embed-images] not embedded, status ${res.status}: ${url}`);
  } catch (e) {
    console.warn(`[embed-images] not embedded, lookup failed: ${url}`, e);
  }
  return null;
}
