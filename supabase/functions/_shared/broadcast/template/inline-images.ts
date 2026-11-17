/** Inline (CID) images for outgoing email. Outlook blocks remote images until
 * the reader allows them, so images served from our own public storage are
 * attached to the message and referenced as `cid:` instead. Pure: no Deno /
 * browser APIs; `embed-images.ts` decides which images are safe to embed. */

/** Resend attachment that the HTML references as `cid:<content_id>`. */
export type InlineImageAttachment = {
  filename: string;
  path: string;
  content_id: string;
};

/** Public buckets whose images may be embedded: template images and the
 * tenant's brand logo. */
const INLINE_IMAGE_BUCKETS = ["broadcast-media", "tenant-logos"];

// Formats every mail client renders inline; others (svg, webp) stay remote.
const INLINE_IMAGE_EXTENSION = /\.(png|jpe?g|gif)$/i;

// The src value is quoted (groups 2-3) or, in hand-written HTML, bare (group 4).
const IMG_SRC = /(<img\b[^>]*?\ssrc\s*=\s*)(?:(["'])([^"']+)\2|([^\s"'>]+))/gi;

/** Public URL prefixes of the buckets images may be embedded from. */
export function inlineImageUrlPrefixes(supabaseUrl: string): Array<string> {
  const base = supabaseUrl.replace(/\/+$/, "");
  return INLINE_IMAGE_BUCKETS.map(
    (bucket) => `${base}/storage/v1/object/public/${bucket}/`,
  );
}

/**
 * The distinct image URLs in the HTML that are candidates for embedding, in
 * document order: served from an allowed prefix, in a format clients render.
 * Images from any other host are never candidates, so tenant-authored HTML
 * cannot make Resend fetch an arbitrary URL.
 */
export function inlineImageUrls(
  html: string,
  allowedUrlPrefixes: Array<string>,
): Array<string> {
  const urls = new Set<string>();
  for (const match of html.matchAll(IMG_SRC)) {
    const url = decodeSrc(match[3] ?? match[4]);
    const isAllowed = allowedUrlPrefixes.some((p) => url.startsWith(p));
    if (isAllowed && imageExtension(url)) {
      urls.add(url);
    }
  }
  return [...urls];
}

/**
 * Point the `<img>` tags of the given URLs at inline attachments. An image
 * used more than once is attached once; every other image is left as it is.
 */
export function inlineEmailImages(
  html: string,
  embedUrls: Array<string>,
): { html: string; attachments: Array<InlineImageAttachment> } {
  const attachments = embedUrls.map((url, index): InlineImageAttachment => ({
    filename: `image-${index + 1}.${imageExtension(url)}`,
    path: url,
    content_id: `image-${index + 1}`,
  }));
  const byUrl = new Map(attachments.map((a) => [a.path, a]));
  const inlined = html.replace(
    IMG_SRC,
    (tag, beforeUrl: string, quote = '"', quoted?: string, bare?: string) => {
      const attachment = byUrl.get(decodeSrc(quoted ?? bare ?? ""));
      return attachment
        ? `${beforeUrl}${quote}cid:${attachment.content_id}${quote}`
        : tag;
    },
  );
  return { html: inlined, attachments };
}

/** The src is read from HTML, where `&` in a query string is escaped. */
function decodeSrc(src: string): string {
  return src.replace(/&amp;/g, "&");
}

/** Lower-case extension of an embeddable image URL, or undefined. */
function imageExtension(url: string): string | undefined {
  return url.split(/[?#]/)[0].match(INLINE_IMAGE_EXTENSION)?.[1].toLowerCase();
}
