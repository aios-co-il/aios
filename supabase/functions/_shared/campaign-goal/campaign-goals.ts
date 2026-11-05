import { facebookCampaignGoals } from "./facebook-goal.ts";
import { isFacebookLeadsOnlyTable } from "./facebook-type.ts";
import {
  googleReportCampaignKey,
  googleReportCampaignVerdicts,
} from "./google-goal.ts";
import { googleReportFallbackGoal } from "./google-presence.ts";
import type { ReportCampaignGoal } from "./report-goals.ts";

/** A report record (crm_records) with the table it belongs to. */
export type CampaignGoalRecord = {
  table_id: string;
  data?: Record<string, unknown> | null;
};

/** The parts of a report table (crm_tables) that decide its campaigns' goals. */
export type CampaignGoalTable = {
  id: string;
  integration_type?: string | null;
  integration_settings?: Record<string, unknown> | null;
  category?: string | null;
};

/** A campaign's goal and the strongest signal behind it. */
export type CampaignGoalVerdict = {
  goal: ReportCampaignGoal;
  /** platform_goal, explicit_mapping or table_report_type. */
  source: string;
};

const META_TABLE_TYPES: ReadonlySet<string> = new Set([
  "facebook_insights",
  "facebook_ecommerce",
]);

/**
 * The key a report groups a campaign's rows under: its id, else its name, as
 * the internal report keys campaign-level rows.
 */
export function reportCampaignKey(data: Record<string, unknown>): string {
  return String(
    data.campaign_id || data.campaign_name || data.campaign || "ללא שם",
  );
}

/**
 * The goal of each record's campaign as its table's report shows it, over the
 * campaign's records in that table: a Meta table by facebookCampaignGoal
 * (a leads-only table keeps every non-traffic campaign in leads), a Google Ads
 * table by googleReportCampaignGoals and, for rows no rule can key, the
 * table's own goal. Records of any other table get null.
 */
export function reportCampaignGoalOf(
  records: Array<CampaignGoalRecord>,
  tables: Array<CampaignGoalTable>,
): (record: CampaignGoalRecord) => CampaignGoalVerdict | null {
  const tableById = new Map(tables.map((table) => [table.id, table]));
  const verdicts = new Map<string, Map<string, CampaignGoalVerdict>>();
  const fallbacks = new Map<string, CampaignGoalVerdict>();
  for (const [tableId, rows] of recordsByTable(records)) {
    const table = tableById.get(tableId);
    if (table && META_TABLE_TYPES.has(table.integration_type ?? "")) {
      verdicts.set(tableId, metaVerdicts(rows, table));
    } else if (table?.integration_type === "google_ads") {
      verdicts.set(tableId, googleReportCampaignVerdicts(rows, [table]));
      fallbacks.set(tableId, {
        goal: googleReportFallbackGoal([table]),
        source: "table_report_type",
      });
    }
  }
  return (record) => {
    const data = record.data ?? {};
    const table = tableById.get(record.table_id);
    const key =
      table?.integration_type === "google_ads"
        ? googleReportCampaignKey(data)
        : reportCampaignKey(data);
    return (
      verdicts.get(record.table_id)?.get(key) ??
      fallbacks.get(record.table_id) ??
      null
    );
  };
}

/** One table's records, grouped by table id in the order first seen. */
function recordsByTable(
  records: Array<CampaignGoalRecord>,
): Map<string, Array<CampaignGoalRecord>> {
  const byTable = new Map<string, Array<CampaignGoalRecord>>();
  for (const record of records) {
    const rows = byTable.get(record.table_id) ?? [];
    rows.push(record);
    byTable.set(record.table_id, rows);
  }
  return byTable;
}

/** Each Meta campaign's goal in one table; Meta's setup is the platform's own goal. */
function metaVerdicts(
  rows: Array<CampaignGoalRecord>,
  table: CampaignGoalTable,
): Map<string, CampaignGoalVerdict> {
  const goals = facebookCampaignGoals(rows, reportCampaignKey, {
    leadsOnly: isFacebookLeadsOnlyTable(table.integration_settings),
  });
  const verdicts = new Map<string, CampaignGoalVerdict>();
  for (const [key, goal] of goals) {
    verdicts.set(key, { goal, source: "platform_goal" });
  }
  return verdicts;
}
