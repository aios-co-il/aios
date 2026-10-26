/**
 * Report share links (public-dashboard, public-table) answer anyone holding the
 * link. `crm_tables.integration_settings` mixes display choices with
 * credentials (webhook_secret, tokens, API keys), so a public response carries
 * only the settings the shared pages read, through `toPublicTableSettings`.
 *
 * The keys come from src/pages/SharedDashboard.tsx, src/pages/SharedTable.tsx
 * and the helpers they call:
 * - campaign_type: getCampaignType, facebookTableUsesMixedRows,
 *   isFacebookLeadsOnlyTable, resolveAnalyticsReportMode, SharedTable mode
 * - currency: resolveDashboardCurrency, SharedTable currency formatting
 * - default_report_mode: resolveAnalyticsReportMode
 * - use_woo_google_attribution: shouldUseGoogleWooAttributionOverlay
 * - shared_tabs / sharedTabs: parseSharedReportTabs
 * - targetDomain: SharedTable monthly work header
 * - linkedGscLangFilter: SharedTable SEO keyword language filter
 * - manual_roi: SharedTable ManualROICard (closures, revenue)
 * - pulse_campaign_goals: per-campaign goal overrides that the Google Ads
 *   campaign goals read on shared dashboards (PR #936)
 *
 * A new read on a shared page needs its key here;
 * src/lib/publicTableSettings.test.ts checks that the shared-page helpers
 * decide the same with the filtered settings as with the stored ones.
 */

export type PublicSettingScalar = string | number | boolean | null;
type TabFlag = boolean | number | string;
type RoiAmount = number | null;

export type PublicTableSettings = {
  campaign_type?: PublicSettingScalar;
  currency?: PublicSettingScalar;
  default_report_mode?: PublicSettingScalar;
  use_woo_google_attribution?: PublicSettingScalar;
  shared_tabs?: Record<string, TabFlag>;
  sharedTabs?: Record<string, TabFlag>;
  targetDomain?: PublicSettingScalar;
  linkedGscLangFilter?: PublicSettingScalar;
  manual_roi?: { closures?: RoiAmount; revenue?: RoiAmount };
  pulse_campaign_goals?: Record<string, string>;
};

export type PublicTableSettingsKey = keyof PublicTableSettings;

const MAX_TEXT_LENGTH = 256;
const MAX_GOAL_LENGTH = 32;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/** A short text, number, boolean or null. Objects and long text are dropped. */
function scalar(value: unknown): PublicSettingScalar | undefined {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number")
    return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.length <= MAX_TEXT_LENGTH)
    return value;
  return undefined;
}

/** The forms of a tab flag that parseSharedReportTabs reads. */
const isTabFlag = (value: unknown): value is TabFlag =>
  typeof value === "boolean" ||
  value === 0 ||
  value === 1 ||
  value === "true" ||
  value === "false";

const isGoal = (value: unknown): value is string =>
  typeof value === "string" && value.length <= MAX_GOAL_LENGTH;

const isRoiAmount = (value: unknown): value is RoiAmount =>
  value === null || (typeof value === "number" && Number.isFinite(value));

/** The entries of an object whose key is short and whose value passes `keep`. */
function entriesWhere<T>(keep: (value: unknown) => value is T) {
  return (value: unknown): Record<string, T> | undefined => {
    if (!isPlainObject(value)) return undefined;
    const out: Record<string, T> = {};
    for (const [key, entry] of Object.entries(value))
      if (key.length <= MAX_TEXT_LENGTH && keep(entry)) out[key] = entry;
    return out;
  };
}

function manualRoi(value: unknown): PublicTableSettings["manual_roi"] {
  if (!isPlainObject(value)) return undefined;
  const out: NonNullable<PublicTableSettings["manual_roi"]> = {};
  if (isRoiAmount(value.closures)) out.closures = value.closures;
  if (isRoiAmount(value.revenue)) out.revenue = value.revenue;
  return out;
}

const PUBLIC_SETTING_FILTERS: {
  [K in PublicTableSettingsKey]-?: (
    value: unknown,
  ) => PublicTableSettings[K] | undefined;
} = {
  campaign_type: scalar,
  currency: scalar,
  default_report_mode: scalar,
  use_woo_google_attribution: scalar,
  shared_tabs: entriesWhere(isTabFlag),
  sharedTabs: entriesWhere(isTabFlag),
  targetDomain: scalar,
  linkedGscLangFilter: scalar,
  manual_roi: manualRoi,
  pulse_campaign_goals: entriesWhere(isGoal),
};

/** Every `integration_settings` key a share link may return. */
export const PUBLIC_TABLE_SETTINGS_KEYS = Object.freeze(
  Object.keys(PUBLIC_SETTING_FILTERS) as PublicTableSettingsKey[],
);

/**
 * The part of a table's `integration_settings` that a share link may return.
 * Anything not on the list, and any value of an unexpected shape, is dropped.
 */
export function toPublicTableSettings(settings: unknown): PublicTableSettings {
  if (!isPlainObject(settings)) return {};
  const out: Record<string, unknown> = {};
  for (const key of PUBLIC_TABLE_SETTINGS_KEYS) {
    const value = PUBLIC_SETTING_FILTERS[key](settings[key]);
    if (value !== undefined) out[key] = value;
  }
  return out as PublicTableSettings;
}

const CACHED_TABLE_SLOTS = ["ga_table", "gsc_table"] as const;

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
  if (!isPlainObject(payload)) return null;

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
