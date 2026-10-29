import {
  isPlainObject,
  toPublicTableSettings,
} from "../_shared/share-links/public-table-settings.ts";

/**
 * public-table keeps SEO share responses in `seo_share_response_cache` for ten
 * minutes, and bodies cached before this filter existed hold full settings.
 * Every table on a cached body is filtered again on the way out. The main
 * table takes `liveSettings` when given, so display choices (shared tabs)
 * apply without waiting out the cache. Returns null when the body is not a
 * JSON object, so the caller builds a fresh response.
 */
export function toPublicCachedShareBody(
  cachedBody: string,
  liveSettings?: unknown,
): string | null {
  let payload: unknown;
  try {
    payload = JSON.parse(cachedBody);
  } catch {
    return null;
  }
  if (!isPlainObject(payload)) {
    return null;
  }

  if (isPlainObject(payload.table)) {
    payload.table = {
      ...payload.table,
      integration_settings: toPublicTableSettings(
        liveSettings ?? payload.table.integration_settings,
      ),
    };
  }
  for (const slot of CACHED_TABLE_SLOTS) {
    const cached = payload[slot];
    if (isPlainObject(cached)) {
      payload[slot] = {
        ...cached,
        integration_settings: toPublicTableSettings(
          cached.integration_settings,
        ),
      };
    }
  }
  return JSON.stringify(payload);
}

const CACHED_TABLE_SLOTS = ["ga_table", "gsc_table"] as const;
