import { assertStrictEquals } from "jsr:@std/assert@1";
import { buildPulseAttentionRows } from "./pulse-attention-matrix.mjs";
import { classifyPulseCampaignGoal } from "./pulse-campaign-goals.mjs";

/** A campaign change from yesterday, so "no campaign touch" never fires by date alone. */
const RECENT_CHANGE = new Date(Date.now() - 86_400_000).toISOString();

const leadsGoogleTable = {
  id: "ga-leads",
  client_id: "client-3",
  integration_type: "google_ads",
  integration_settings: { target_roas: 3 },
};

const client = {
  clientId: "client-3",
  clientName: "חנות",
  campaignerName: "דוד",
  moodStatus: "happy",
  lastClientCallAt: RECENT_CHANGE,
  daysSinceLastCommunication: 1,
  recentCommunicationStatus: null,
  hasRecentComplaintUpdate: false,
};

/** One week of a Google sales campaign that misses its 3x ROAS target. */
const salesCampaignRow = (classificationSource: string, name: string) => ({
  client_id: "client-3",
  table_id: "ga-leads",
  platform: "google",
  goal: "ecommerce",
  classification_source: classificationSource,
  campaign_name: name,
  spend_7d: 1000,
  outcomes_7d: 2,
  revenue_7d: 500,
  efficiency_7d: 0.5,
  baseline_efficiency_7d: 3,
  trend_7d_pct: -80,
  last_change_at: RECENT_CHANGE,
});

Deno.test(
  "a Google sales campaign detected from its conversion goal keeps ROAS in a leads report",
  () => {
    const rows = buildPulseAttentionRows({
      campaignRows: [salesCampaignRow("platform_goal", "PMax")],
      tables: [leadsGoogleTable],
      clients: [client],
    });
    assertStrictEquals(rows.length, 1);
    assertStrictEquals(rows[0].primaryGoal, "ecommerce");
    assertStrictEquals(rows[0].target?.kind, "roas");
    assertStrictEquals(rows[0].currentEfficiency, 0.5);
  },
);

Deno.test(
  "a Google campaign named as a sales campaign is an explicit mapping and keeps ROAS in a leads report",
  () => {
    const { goal, source } = classifyPulseCampaignGoal(
      { campaign_name: "sales - PMax" },
      leadsGoogleTable,
    );
    assertStrictEquals(goal, "ecommerce");
    assertStrictEquals(source, "explicit_mapping");

    const rows = buildPulseAttentionRows({
      campaignRows: [salesCampaignRow(source, "sales - PMax")],
      tables: [leadsGoogleTable],
      clients: [client],
    });
    assertStrictEquals(rows[0].primaryGoal, "ecommerce");
    assertStrictEquals(rows[0].target?.kind, "roas");
  },
);
