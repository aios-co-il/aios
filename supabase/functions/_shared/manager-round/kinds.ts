/**
 * Finding kinds of Carmen's manager round (AIO-251). The kind list and the
 * live statuses are also CHECK / index predicates in
 * supabase/migrations/20261101100000_carmen_manager_round.sql; kinds.test.ts
 * keeps the two in step.
 */

export const FINDING_KINDS = [
  // No collector emits these nine yet: the KPI, platform alert and
  // reconciliation detectors are AIO-251 phase 2.
  "cost_spike",
  "roas_drop",
  "kpi_exception",
  "no_results_spend",
  "platform_alert",
  "data_gap",
  "reconcile_mismatch",
  "reconcile_missing_day",
  "unmapped_spend",
  // Chat collector (AIO-252).
  "unanswered_request",
  "client_complaint",
  // Contact collector (AIO-253).
  "contact_not_logged",
  "no_contact",
  // Group update collector (AIO-254).
  "card_stale_group",
  // Chat collector (AIO-252).
  "unlinked_group",
  // The router's own routing gaps (recipients/data-findings.ts).
  "no_campaigner",
  "missing_phone",
] as const;

export type FindingKind = (typeof FINDING_KINDS)[number];

export const FINDING_SEVERITIES = ["info", "warning", "critical"] as const;

export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

/** Statuses of a finding that is still open (the dedupe key covers these). */
export const FINDING_LIVE_STATUSES = [
  "open",
  "notified",
  "acknowledged",
  "snoozed",
] as const;

/** Live statuses the router still acts on (acknowledged stops the ladder). */
export const FINDING_ROUTABLE_STATUSES = [
  "open",
  "notified",
  "snoozed",
] as const;

/** Hebrew names for the feed and the settings screen. */
export const FINDING_KIND_LABELS_HE: Record<FindingKind, string> = {
  cost_spike: "עלייה בעלות",
  roas_drop: "ירידה ב־ROAS",
  kpi_exception: "חריגה מיעד",
  no_results_spend: "הוצאה בלי תוצאות",
  platform_alert: "התראת פלטפורמה",
  data_gap: "פער נתונים",
  reconcile_mismatch: "אי־התאמה לפלטפורמה",
  reconcile_missing_day: "יום חסר בנתונים",
  unmapped_spend: "הוצאה בחשבון לא משויך",
  unanswered_request: "בקשת לקוח בלי מענה",
  client_complaint: "תלונת לקוח",
  contact_not_logged: "שיחה שלא תועדה",
  no_contact: "אין קשר עם הלקוח",
  card_stale_group: "עדכון קבוצה שלא נרשם בכרטיס",
  unlinked_group: "קבוצה לא משויכת ללקוח",
  no_campaigner: "לקוח בלי קמפיינר",
  missing_phone: "חסר טלפון לאיש צוות",
};

/** Narrows an unknown value to a finding kind. */
export function isFindingKind(value: unknown): value is FindingKind {
  return FINDING_KINDS.some((kind) => kind === value);
}

/** Narrows an unknown value to a finding severity. */
export function isFindingSeverity(value: unknown): value is FindingSeverity {
  return FINDING_SEVERITIES.some((severity) => severity === value);
}
