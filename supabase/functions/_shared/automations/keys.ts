/**
 * The automations an org can switch off for itself (AIO-314), by the key
 * stored in carmen_automation_settings. Imported by the edge workers and the
 * frontend (AIO-315), so adding one touches this file only.
 */
export const AUTOMATION_KEYS = [
  "meta_status_check",
  "google_status_check",
  "reconcile_nightly",
] as const;

export type AutomationKey = (typeof AUTOMATION_KEYS)[number];
