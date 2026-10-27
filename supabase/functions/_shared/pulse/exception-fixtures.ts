// campaign_exception fixtures for the Deno tests of AIO-243 wording and the
// per-run flood guard.
import { assertEquals } from "jsr:@std/assert@1";
import {
  evaluatePulseInstantAlerts,
  type PulseSnapshotAlertInput,
} from "../pulse-instant-alerts.ts";
import { healthy, NO_CONTACT_OFF, WEDNESDAY } from "./fake-alert-log.ts";

type Campaign = NonNullable<
  PulseSnapshotAlertInput["campaign_breakdown"]
>[number];

export const EXCEPTION_CAMPAIGN: Campaign = {
  campaign_key: "meta:id:123",
  campaign_name: "Leads",
  goal: "leads",
  status_reason: "חריגה מתמשכת מהיעד המאושר (CPL 30)",
  alert_eligible: true,
  target_kind: "cpl",
  target_value: 30,
  efficiency_3d: 52,
  efficiency_7d: 48,
  trend_3d_pct: 40,
  trend_7d_pct: 31,
  data_fresh_through: "2026-10-27",
  last_change_at: "2026-10-20T08:00:00Z",
};

export const STATIC_CHECK =
  "בדיקה מומלצת: לאמת יעד, אירוע אופטימיזציה ושינויים אחרונים לפני פעולה.";

export const SUMMARY_HEADER = "🔴 *התראת דופק — סיכום חריגות קמפיין*";

/** Client c1 with these campaigns, or with EXCEPTION_CAMPAIGN alone. */
export function exceptionSnapshot(
  ...campaigns: Campaign[]
): PulseSnapshotAlertInput {
  return {
    ...healthy([]),
    campaign_breakdown: campaigns.length ? campaigns : [EXCEPTION_CAMPAIGN],
  };
}

/** The message code builds for a snapshot with one campaign_exception. */
export function deterministicExceptionMessage(
  snapshot = exceptionSnapshot(),
): string {
  const rows = evaluatePulseInstantAlerts(
    [snapshot],
    [],
    NO_CONTACT_OFF,
    WEDNESDAY.getTime(),
  );
  assertEquals(
    rows.map((row) => row.rule_type),
    ["campaign_exception"],
  );
  return rows[0].message;
}

/** n eligible exceptions; campaign i has trend 10*i, so the last is worst. */
export function exceptionCampaigns(n: number, prefix = "c"): Campaign[] {
  return Array.from({ length: n }, (_, i) => ({
    ...EXCEPTION_CAMPAIGN,
    campaign_key: `meta:id:${prefix}${i + 1}`,
    campaign_name: `Campaign ${prefix}${i + 1}`,
    status_reason: `סיבה ${prefix}${i + 1}`,
    trend_3d_pct: 10 * (i + 1),
    trend_7d_pct: 0,
  }));
}

/** True for the flood guard's summary message. */
export function isSummary(message: string): boolean {
  return message.startsWith(SUMMARY_HEADER);
}

/** The campaign name line of an individual campaign_exception message. */
export function campaignOf(message: string): string | undefined {
  return message.match(/קמפיין: (.*)/)?.[1];
}

/** The evidence object of a logged pulse_instant_alert_log row. */
export function evidenceOf(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const evidence = row.evidence;
  return typeof evidence === "object" && evidence !== null
    ? { ...evidence }
    : {};
}

/** The campaign names of the individual messages among these sends, sorted. */
export function campaignNames(
  sends: Array<{ message: string }>,
): Array<string | undefined> {
  return sends
    .filter((send) => !isSummary(send.message))
    .map((send) => campaignOf(send.message))
    .sort();
}

/** The text of the summary message among these sends. */
export function summaryText(sends: Array<{ message: string }>): string {
  return sends.find((send) => isSummary(send.message))?.message ?? "";
}

/** The console.error calls made while `body` runs. */
export async function consoleErrorsOf(
  body: () => Promise<void>,
): Promise<unknown[][]> {
  const errors: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };
  try {
    await body();
  } finally {
    console.error = original;
  }

  return errors;
}
