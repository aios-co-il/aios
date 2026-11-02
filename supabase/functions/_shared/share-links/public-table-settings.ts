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
 * - pulse_campaign_goals: per-campaign goal overrides (short goal labels).
 *   Nothing on develop reads them yet; they are for the shared dashboard's
 *   Google Ads goal split (AIO-217).
 *
 * Left out on purpose because no shared page reads them: last_sync_at,
 * last_sync_outcome (its error text can quote credentials) and labels.
 *
 * A new read on a shared page needs its key here;
 * src/pages/SharedPages.publicSettings.test.ts checks that the shared-page
 * helpers decide the same with the filtered settings as with the stored ones,
 * and that no file the shared pages import reads a key missing from this list.
 */

type PublicSettingScalar = string | number | boolean | null;

type TabFlag = boolean | number | string;

type RoiAmount = number | null;

type PublicTableSettingValues = {
  campaign_type: PublicSettingScalar;
  currency: PublicSettingScalar;
  default_report_mode: PublicSettingScalar;
  use_woo_google_attribution: PublicSettingScalar;
  shared_tabs: Record<string, TabFlag>;
  sharedTabs: Record<string, TabFlag>;
  targetDomain: PublicSettingScalar;
  linkedGscLangFilter: PublicSettingScalar;
  manual_roi: { closures?: RoiAmount; revenue?: RoiAmount };
  pulse_campaign_goals: Record<string, string>;
};

type PublicTableSettings = Partial<PublicTableSettingValues>;

/**
 * The part of a table's `integration_settings` that a share link may return.
 * Anything not on the list, and any value of an unexpected shape, is dropped.
 */
export function toPublicTableSettings(settings: unknown): PublicTableSettings {
  if (!isPlainObject(settings)) {
    return {};
  }
  const out: PublicTableSettings = {};
  for (const key of PUBLIC_TABLE_SETTINGS_KEYS) {
    copyFiltered(out, settings, key);
  }
  // parseSharedReportTabs reads `shared_tabs ?? sharedTabs`, so a stored
  // shared_tabs, even one it ignores (an array or text shows every tab), means
  // the legacy sharedTabs is never read. Without this, dropping a malformed
  // shared_tabs would let sharedTabs hide tabs the stored settings show.
  if (settings.shared_tabs != null) {
    delete out.sharedTabs;
  }
  return out;
}

/** Copies `key` when its filter keeps the value. */
function copyFiltered<K extends keyof PublicTableSettingValues>(
  out: PublicTableSettings,
  settings: Record<string, unknown>,
  key: K,
): void {
  const value = PUBLIC_SETTING_FILTERS[key](settings[key]);
  if (value !== undefined) {
    out[key] = value;
  }
}

const PUBLIC_SETTING_FILTERS: {
  [K in keyof PublicTableSettingValues]: (
    value: unknown,
  ) => PublicTableSettingValues[K] | undefined;
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
  Object.keys(PUBLIC_SETTING_FILTERS) as (keyof PublicTableSettingValues)[],
);

const MAX_TEXT_LENGTH = 256;

const MAX_GOAL_LENGTH = 32;

/** A non-null, non-array object literal (prototype is Object.prototype). */
export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/** A short text, number, boolean or null. Objects and long text are dropped. */
function scalar(value: unknown): PublicSettingScalar | undefined {
  if (value === null || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string" && value.length <= MAX_TEXT_LENGTH) {
    return value;
  }
  return undefined;
}

/** The forms of a tab flag that parseSharedReportTabs reads. */
function isTabFlag(value: unknown): value is TabFlag {
  return (
    typeof value === "boolean" ||
    value === 0 ||
    value === 1 ||
    value === "true" ||
    value === "false"
  );
}

/** A goal label short enough to be a goal name, not free text. */
function isGoal(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_GOAL_LENGTH;
}

/** A finite number or null, the forms ManualROICard reads. */
function isRoiAmount(value: unknown): value is RoiAmount {
  return (
    value === null || (typeof value === "number" && Number.isFinite(value))
  );
}

/** The entries of an object whose key is short and whose value passes `keep`. */
function entriesWhere<T>(keep: (value: unknown) => value is T) {
  return (value: unknown): Record<string, T> | undefined => {
    if (!isPlainObject(value)) {
      return undefined;
    }
    const out: Record<string, T> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (key.length <= MAX_TEXT_LENGTH && keep(entry)) {
        out[key] = entry;
      }
    }
    return out;
  };
}

/** closures and revenue from manual_roi; any other field is dropped. */
function manualRoi(
  value: unknown,
): PublicTableSettingValues["manual_roi"] | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }
  const out: PublicTableSettingValues["manual_roi"] = {};
  if (isRoiAmount(value.closures)) {
    out.closures = value.closures;
  }
  if (isRoiAmount(value.revenue)) {
    out.revenue = value.revenue;
  }
  return out;
}
