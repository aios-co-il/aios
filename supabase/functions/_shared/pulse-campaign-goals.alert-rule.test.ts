import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { buildPulseCampaignRows } from "./pulse-campaign-goals.mjs";
import {
  evaluatePulseInstantAlerts,
  type PulseSnapshotAlertInput,
} from "./pulse-instant-alerts.ts";
import {
  AVIELI,
  REPORT_GOAL_TABLES,
  TODAY,
  TODAY_RECORDS,
} from "./pulse/report-goal-fixtures.ts";

const SPEND_WITHOUT_RESULTS =
  "קיימת הוצאה ללא תוצאות ב־7 הימים המלאים האחרונים";

/** Fingerprints the 07:06 run logged for Avieli's three sales campaigns. */
const AVIELI_SALES_FINGERPRINTS = [
  `${AVIELI}:google:ecommerce:name:פרפורמנס מקס | רחב על האתר | 8.6:${SPEND_WITHOUT_RESULTS}:no_target:none`,
  `${AVIELI}:meta:ecommerce:name:קמפיין purchase 3.11:${SPEND_WITHOUT_RESULTS}:no_target:none`,
  `${AVIELI}:meta:ecommerce:name:קמפיין מכירות סרטונים:${SPEND_WITHOUT_RESULTS}:no_target:none`,
];

/** The fingerprint of the lead campaign that spends with 0 leads. */
const LEAD_ZERO_FINGERPRINT = `leads:meta:leads:name:קמפיין לידים -עמוד נחיתה 4.11:${SPEND_WITHOUT_RESULTS}:no_target:none`;

const rows = buildPulseCampaignRows({
  records: TODAY_RECORDS,
  tables: REPORT_GOAL_TABLES,
  nowYmd: TODAY,
});

/** The pulse row of the campaign whose name contains `name`. */
function row(name: string) {
  const found = rows.find((candidate) =>
    candidate.campaign_name.includes(name),
  );
  if (!found) {
    throw new Error(`no pulse row for ${name}`);
  }
  return found;
}

Deno.test(
  "today's campaigns, judged by the report's goal and results",
  async (t) => {
    await t.step(
      "סול לטינו is traffic: its 0 conversations are no result, so no alert",
      () => {
        const solLatino = row("סול לטינו");
        assertStrictEquals(solLatino.goal, "engagement");
        assertStrictEquals(solLatino.outcomes_7d, null);
        assertStrictEquals(solLatino.alert_eligible, false);
      },
    );

    await t.step("awareness and traffic campaigns never alert", () => {
      for (const name of [
        "מבצע אטרף סניפים 22-31.10‎ - Copy",
        "מבצע אטרף סניפים 22-31.10",
        "קמפיין מעורבות | סרטונים",
        "קמפיין טראפיק לאינסטגרם",
        "תנועה עם טרגוט חדש",
      ]) {
        assertStrictEquals(row(name).goal, "engagement", name);
        assertStrictEquals(row(name).alert_eligible, false, name);
      }
    });

    await t.step(
      "the Christmas campaign spent on its first day only: no alert",
      () => {
        const christmas = row("שווקי חג המולד");
        assertStrictEquals(christmas.goal, "ecommerce");
        assertStrictEquals(christmas.spend_3d, 0);
        assertStrictEquals(christmas.status_reason, SPEND_WITHOUT_RESULTS);
        assertStrictEquals(christmas.status, "warning");
        assertStrictEquals(christmas.alert_eligible, false);
      },
    );

    await t.step("a Google campaign Google marks ENDED does not alert", () => {
      const ended = row("חיפוש חנוכה");
      assertStrictEquals(ended.goal, "leads");
      assertStrictEquals(ended.delivery_status, "ended");
      assertStrictEquals(ended.alert_eligible, false);
    });

    await t.step("a lead campaign that spends with 0 leads alerts", () => {
      const leads = row("קמפיין לידים -עמוד נחיתה");
      assertStrictEquals(leads.goal, "leads");
      assertStrictEquals(leads.outcomes_7d, 0);
      assertStrictEquals(leads.status_reason, SPEND_WITHOUT_RESULTS);
      assertStrictEquals(leads.alert_eligible, true);
    });

    await t.step("Avieli's sales campaigns that still spend alert", () => {
      for (const name of ["8.6", "PURCHASE 3.11", "מכירות סרטונים"]) {
        assertStrictEquals(row(name).goal, "ecommerce", name);
        assertStrictEquals(row(name).outcomes_7d, 0, name);
        assertStrictEquals(row(name).alert_eligible, true, name);
      }
    });
  },
);

Deno.test(
  "today's run alerts on the running sales and lead campaigns only, with today's fingerprints",
  () => {
    const byClient = new Map<string, PulseSnapshotAlertInput>();
    for (const campaign of rows) {
      const snapshot = byClient.get(campaign.client_id) ?? {
        client_id: campaign.client_id,
        client_name: campaign.client_id,
        campaign_breakdown: [],
      };
      snapshot.campaign_breakdown?.push(campaign);
      byClient.set(campaign.client_id, snapshot);
    }
    const alerts = evaluatePulseInstantAlerts([...byClient.values()], [], {
      instant_wa_enabled: true,
      no_contact_enabled: false,
      cpl_spike_enabled: false,
      disconnected_enabled: false,
    });
    assertEquals(
      alerts.map((alert) => alert.fingerprint).sort(),
      [...AVIELI_SALES_FINGERPRINTS, LEAD_ZERO_FINGERPRINT].sort(),
    );
  },
);
