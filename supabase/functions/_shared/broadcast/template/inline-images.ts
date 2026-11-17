/** Inline (CID) images for outgoing email. Outlook blocks remote images until
 * the reader allows them, so images served from our own public storage are
 * attached to the message and referenced as `cid:` instead. Pure: no Deno /
 * browser APIs. */

import {
  attachmentUrlPrefix,
  emailAttachmentsForResend,
} from "./email-attachments.ts";

/** Resend attachment that the HTML references as `cid:<content_id>`. */
export type InlineImageAttachment = {
  filename: string;
  path: string;
  content_id: string;
};

/** Public buckets whose images may be embedded: template images and the
 * tenant's brand logo. */
const INLINE_IMAGE_BUCKETS = ["broadcast-media", "tenant-logos"];

// Every inline image is downloaded and attached on each send, so a template
// full of pictures keeps the rest as ordinary remote images.
export const MAX_INLINE_IMAGES = 10;

// Formats every mail client renders inline; others (svg, webp) stay remote.
const INLINE_IMAGE_EXTENSION = /\.(png|jpe?g|gif)$/i;

const IMG_SRC = /(<img\b[^>]*?\ssrc\s*=\s*)(["'])([^"']+)\2/gi;

/** Public URL prefixes of the buckets images may be embedded from. */
export function inlineImageUrlPrefixes(supabaseUrl: string): Array<string> {
  const base = supabaseUrl.replace(/\/+$/, "");
  return INLINE_IMAGE_BUCKETS.map(
    (bucket) => `${base}/storage/v1/object/public/${bucket}/`,
  );
}

/**
 * The `html` and `attachments` fields of a broadcast email: the stored file
 * attachments plus the body images embedded from our storage.
 */
export function emailSendFields(
  html: string,
  storedAttachments: unknown,
  supabaseUrl: string,
): {
  html: string;
  attachments: Array<{ filename: string; path: string; content_id?: string }>;
} {
  const inlined = inlineEmailImages(html, inlineImageUrlPrefixes(supabaseUrl));
  return {
    html: inlined.html,
    attachments: [
      ...emailAttachmentsForResend(
        storedAttachments,
        attachmentUrlPrefix(supabaseUrl),
      ),
      ...inlined.attachments,
    ],
  };
}

/**
 * Point `<img>` tags served from our storage at inline attachments. An image
 * used more than once is attached once. Images from any other host are left
 * as they are, so tenant-authored HTML cannot make Resend fetch an arbitrary
 * URL.
 */
export function inlineEmailImages(
  html: string,
  allowedUrlPrefixes: Array<string>,
): { html: string; attachments: Array<InlineImageAttachment> } {
  const byUrl = new Map<string, InlineImageAttachment>();
  const inlined = html.replace(
    IMG_SRC,
    (tag, beforeUrl: string, quote: string, url: string) => {
      const attachment = byUrl.get(url) ?? newInlineImage(url, byUrl.size);
      if (!attachment || !isAllowed(url, allowedUrlPrefixes)) {
        return tag;
      }
      byUrl.set(url, attachment);
      return `${beforeUrl}${quote}cid:${attachment.content_id}${quote}`;
    },
  );
  return { html: inlined, attachments: [...byUrl.values()] };
}

/** True when the URL is served from one of our embeddable buckets. */
function isAllowed(url: string, allowedUrlPrefixes: Array<string>): boolean {
  return allowedUrlPrefixes.some((prefix) => url.startsWith(prefix));
}

/** The attachment for a new image, or null when it must stay remote. */
function newInlineImage(
  url: string,
  alreadyInlined: number,
): InlineImageAttachment | null {
  if (alreadyInlined >= MAX_INLINE_IMAGES) {
    return null;
  }
  const extension = url.split(/[?#]/)[0].match(INLINE_IMAGE_EXTENSION)?.[1];
  if (!extension) {
    return null;
  }
  const number = alreadyInlined + 1;
  return {
    filename: `image-${number}.${extension.toLowerCase()}`,
    // The src is read from HTML, where `&` in a query string is escaped.
    path: url.replace(/&amp;/g, "&"),
    content_id: `image-${number}`,
  };
}
