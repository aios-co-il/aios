/** Resolve magazine image URLs for public PBN pages without widening storage policies. */

export const ENTITY_ATTACHMENTS_BUCKET = "entity-attachments";

export type MagazineImageKind = "hero" | "inline";

/** Deterministic storage path written by generate-publishing-articles. */
export function publishingImageStoragePath(
  tenantId: string,
  articleId: string,
  kind: MagazineImageKind,
): string {
  return `${tenantId}/publishing/${articleId}/${kind}.webp`;
}

/**
 * Stable public URL for a generated article image.
 * The publishing-image function streams the object from the private bucket,
 * so magazine pages, og:image tags and crawlers keep working indefinitely.
 */
export function publishingImageProxyUrl(
  supabaseUrl: string,
  articleId: string,
  kind: MagazineImageKind,
): string {
  const base = supabaseUrl.replace(/\/+$/, "");
  return `${base}/functions/v1/publishing-image?article_id=${encodeURIComponent(articleId)}&kind=${kind}`;
}

export function isAbsoluteHttpUrl(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Extract object path from a public/sign entity-attachments URL, or a bare storage path. */
export function extractEntityAttachmentPath(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const bare = trimmed.match(
    /^(?:entity-attachments\/)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/publishing\/.+)$/i,
  );
  if (bare) {
    return bare[1];
  }

  try {
    const url = new URL(trimmed);
    const match = url.pathname.match(
      /\/storage\/v1\/object\/(?:public|sign|authenticated)\/entity-attachments\/(.+)$/,
    );
    if (!match?.[1]) {
      return null;
    }
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/**
 * Public magazine pages may only emit absolute http(s) URLs.
 * Private storage URLs are rewritten to the stable publishing-image proxy.
 * Relative or missing values become null so templates omit the <img> entirely.
 */
export function resolveMagazineImageUrl(
  raw: string | null | undefined,
  kind: MagazineImageKind,
  proxyUrlFor: (kind: MagazineImageKind) => string,
): string | null {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    return null;
  }

  if (extractEntityAttachmentPath(value)) {
    return proxyUrlFor(kind);
  }
  if (!isAbsoluteHttpUrl(value)) {
    return null;
  }
  return value;
}

export function resolveArticleImageFields<
  T extends {
    hero_image_url?: string | null;
    inline_image_url?: string | null;
  },
>(article: T, proxyUrlFor: (kind: MagazineImageKind) => string): T {
  return {
    ...article,
    hero_image_url: resolveMagazineImageUrl(
      article.hero_image_url,
      "hero",
      proxyUrlFor,
    ),
    inline_image_url: resolveMagazineImageUrl(
      article.inline_image_url,
      "inline",
      proxyUrlFor,
    ),
  };
}

/** The supabase.co origin of a stored publishing-image proxy URL (any project ref). */
const STORED_PROXY_ORIGIN =
  /^https:\/\/[a-z0-9]{20}\.supabase\.co(?=\/functions\/v1\/publishing-image(?:[?#]|$))/;

/**
 * Serves a stored proxy URL from the public API address (AIO-647).
 * Articles saved before PUBLIC_API_URL kept the supabase.co address, which
 * changes when the project moves region. Other URLs, and any URL when
 * `publicBase` is empty, come back unchanged.
 */
export function proxyUrlOnPublicApi(
  value: string | null,
  publicBase: string,
): string | null {
  const base = publicBase.replace(/\/+$/, "");
  if (!value || !base) {
    return value;
  }

  return value.replace(STORED_PROXY_ORIGIN, base);
}

/** Applies proxyUrlOnPublicApi to an article's hero and inline image URLs. */
export function articleImagesOnPublicApi<
  T extends {
    hero_image_url: string | null;
    inline_image_url: string | null;
  },
>(article: T, publicBase: string): T {
  return {
    ...article,
    hero_image_url: proxyUrlOnPublicApi(article.hero_image_url, publicBase),
    inline_image_url: proxyUrlOnPublicApi(article.inline_image_url, publicBase),
  };
}
