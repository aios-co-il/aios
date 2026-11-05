/**
 * Fixtures for the pulse target tests: daily campaign rows around a fixed day,
 * report tables, a client's attention context and the instant-alert rules.
 */
import { assertStrictEquals } from "jsr:@std/assert@1";
import { buildPulseCampaignRows } from "../pulse-campaign-goals.mjs";

/** Current 7 days: 09-11..09-17; baseline: 08-14..09-10. */
export const NOW = "2026-09-18";

/** pulse_alert_rules with WhatsApp alerts for campaigns without a target on. */
export const ALERTS_ON = { manager: { cost: { target_less_alerts: true } } };

/** A Meta lead campaign as the classifier sees it. */
export const LEAD = {
  campaign_type: "lead",
  campaign_objective: "OUTCOME_LEADS",
};

/** Instant alerts on, every other rule off. */
export const INSTANT_RULES = {
  instant_wa_enabled: true,
  no_contact_enabled: false,
  cpl_spike_enabled: false,
  disconnected_enabled: false,
};

/** The day `offset` days before 2026-09-17, as YYYY-MM-DD. */
export function day(offset: number): string {
  const date = new Date(Date.UTC(2026, 8, 17) - offset * 86_400_000);
  return date.toISOString().slice(0, 10);
}

/**
 * Daily campaign rows: `baseline` for the 28 baseline days (or fewer), `current`
 * for the last 7 full days.
 */
export function campaignDays({
  tableId,
  campaignId,
  name,
  extra = {},
  baseline,
  current,
  baselineDays = 28,
}: {
  tableId: string;
  campaignId: string;
  name: string;
  extra?: Record<string, unknown>;
  baseline: Record<string, unknown>;
  current: Record<string, unknown>;
  baselineDays?: number;
}): Array<{ table_id: string; data: Record<string, unknown> }> {
  const rowOn = (offset: number, values: Record<string, unknown>) => ({
    table_id: tableId,
    data: {
      date: day(offset),
      campaign_id: campaignId,
      campaign_name: name,
      ...extra,
      ...values,
    },
  });
  const rows: Array<{ table_id: string; data: Record<string, unknown> }> = [];
  for (let i = 7; i < 7 + baselineDays; i += 1) {
    rows.push(rowOn(i, baseline));
  }
  for (let i = 0; i < 7; i += 1) {
    rows.push(rowOn(i, current));
  }
  return rows;
}

/** A Meta insights (lead) report table. */
export function leadsTable(
  id: string,
  clientId: string,
  settings: Record<string, unknown> = {},
) {
  return {
    id,
    client_id: clientId,
    integration_type: "facebook_insights",
    integration_settings: settings,
  };
}

/** The pulse rows of these records; the test expects exactly one campaign. */
export function onlyRow(
  records: Array<{ table_id: string; data: Record<string, unknown> }>,
  tables: object[],
  alertRules: unknown,
) {
  const rows = buildPulseCampaignRows({
    records,
    tables,
    nowYmd: NOW,
    alertRules,
  });
  assertStrictEquals(rows.length, 1);
  return rows[0];
}

/** A happy client with recent contact, for the attention matrix. */
export function attentionClient(clientId: string) {
  return {
    clientId,
    clientName: clientId,
    campaignerName: "דנה",
    moodStatus: "happy",
    lastClientCallAt: null,
    daysSinceLastCommunication: 1,
    recentCommunicationStatus: null,
    hasRecentComplaintUpdate: false,
  };
}

/** The value at `path` inside nested objects and arrays; undefined when a step is missing. */
export function at(value: unknown, ...path: string[]): unknown {
  let current = value;
  for (const key of path) {
    current =
      current !== null && typeof current === "object"
        ? Reflect.get(current, key)
        : undefined;
  }
  return current;
}
