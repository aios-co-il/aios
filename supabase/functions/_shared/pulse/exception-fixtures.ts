// campaign_exception fixtures for the Deno tests of the pulse run message.
import type { PulseSnapshotAlertInput } from "../pulse-instant-alerts.ts";
import { healthy } from "./fake-alert-log.ts";

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

/** Client c1 with these campaigns, or with EXCEPTION_CAMPAIGN alone. */
export function exceptionSnapshot(
  ...campaigns: Campaign[]
): PulseSnapshotAlertInput {
  return {
    ...healthy([]),
    campaign_breakdown: campaigns.length ? campaigns : [EXCEPTION_CAMPAIGN],
  };
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

export const OWNER_PHONE = "972501234567";
export const MANAGER_PHONE = "972529999999";

/** Staff tables for fakeSupabase: team manager m1 (MANAGER_PHONE) on agency a1. */
export const MANAGER_ON_AGENCY_A1 = {
  roles: [{ tenant_id: "t1", user_id: "m1", role: "team_manager" }],
  managedAgencies: [{ user_id: "m1", agency_id: "a1" }],
  profiles: [
    { id: "m1", full_name: "Manager", campaigners: { phone: "0529999999" } },
  ],
};

/** The evidence object of a logged pulse_instant_alert_log row. */
export function evidenceOf(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const evidence = row.evidence;
  return typeof evidence === "object" && evidence !== null
    ? { ...evidence }
    : {};
}

/** The section titles of a run message, in order, between header and footer. */
export function sectionTitles(message: string): string[] {
  return message
    .split("\n\n")
    .slice(1, -1)
    .map((block) => block.split("\n")[0]);
}

/** The lines of the section titled `title` in a run message, title excluded. */
export function sectionLines(message: string, title: string): string[] {
  const block = message
    .split("\n\n")
    .find((each) => each.split("\n")[0] === title);
  return block ? block.split("\n").slice(1) : [];
}
