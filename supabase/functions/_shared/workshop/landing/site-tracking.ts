/**
 * A landing site's tracking ids (Google Tag Manager, GA4, Meta Pixel), set in AIOS and written
 * into the site's site.json. The landing-pages app owns the format and loads the tags on the
 * site's published pages in Production only (aios-co-il/landing-pages: src/lib/site-meta.ts);
 * these patterns match its schema, and the landing_sites column checks match them too.
 */

/** The tracking ids a site can carry, by their key in site.json. */
export const TRACKING_ID_PATTERNS = {
  gtmId: /^GTM-[A-Z0-9]{4,12}$/,
  ga4Id: /^G-[A-Z0-9]{6,14}$/,
  metaPixelId: /^[0-9]{10,20}$/,
} as const;

export type TrackingIdKey = keyof typeof TRACKING_ID_PATTERNS;

export const TRACKING_ID_KEYS = Object.keys(
  TRACKING_ID_PATTERNS,
) as Array<TrackingIdKey>;

/** A site's tracking as site.json holds it: only the ids that are set. */
export type SiteTracking = Partial<Record<TrackingIdKey, string>>;

/** The tracking columns of a landing_sites row. */
export interface TrackingColumns {
  gtm_id: string | null;
  ga4_id: string | null;
  meta_pixel_id: string | null;
}

/** A site row's tracking, with empty ids left out. */
export function siteTrackingOf(row: TrackingColumns): SiteTracking {
  return cleanTracking({
    gtmId: row.gtm_id ?? "",
    ga4Id: row.ga4_id ?? "",
    metaPixelId: row.meta_pixel_id ?? "",
  });
}

/**
 * The site.json with only its tracking replaced, or null when the repository already holds that
 * tracking. Every other key stays as it is, in its place; no ids at all drops the key.
 */
export function siteWithTracking(
  site: Record<string, unknown>,
  tracking: SiteTracking,
): Record<string, unknown> | null {
  const wanted = cleanTracking(tracking);
  if (canonical(site.tracking ?? {}) === canonical(wanted)) {
    return null;
  }
  if (Object.keys(wanted).length > 0) {
    return { ...site, tracking: wanted };
  }
  return Object.fromEntries(
    Object.entries(site).filter(([key]) => key !== "tracking"),
  );
}

/** The ids that are set, trimmed, in the app's key order. */
function cleanTracking(tracking: SiteTracking): SiteTracking {
  const clean: SiteTracking = {};
  for (const key of TRACKING_ID_KEYS) {
    const id = tracking[key]?.trim();
    if (id) {
      clean[key] = id;
    }
  }
  return clean;
}

/** JSON with object keys sorted, so two values compare equal whatever their key order. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(
          Object.entries(inner).sort(([a], [b]) => (a < b ? -1 : 1)),
        )
      : inner,
  );
}
