import type { AgentDatabaseClient } from "../database-contracts.ts";
import { fbResolveClientMetaReport } from "./meta-client-report.ts";
import { fbGetToken } from "./meta-token.ts";
import { readCampaignDays } from "../../_shared/reconcile/meta-campaign-days.ts";
import { liveCampaignWindow } from "../live-campaign-window.ts";
import { CallBudget } from "../../_shared/reconcile/budget.ts";
import { liveCampaignRows } from "../campaign-rows.ts";
import { errorMessage } from "../error-message.ts";

/**
 * Live campaign rows over the last `days` full days, read and counted the way
 * the sync stores them (readCampaignDays) and judged as the client's Meta
 * report judges the same rows (liveCampaignRows). Null on failure.
 */
export async function fbLiveCampaignInsights(
  supabase: AgentDatabaseClient,
  tenantId: string,
  clientId: string,
  days: number,
) {
  try {
    const report = await fbResolveClientMetaReport(
      supabase,
      tenantId,
      clientId,
    );
    const token = await fbGetToken(supabase, tenantId);
    if (!report || !token) {
      return null;
    }
    const rows = await readCampaignDays(
      `act_${report.account}`,
      liveCampaignWindow(days, new Date()),
      token,
      {
        budget: new CallBudget(LIVE_CAMPAIGN_CALL_BUDGET),
        maxPages: LIVE_CAMPAIGN_MAX_PAGES,
      },
    );
    return liveCampaignRows(rows, report.table);
  } catch (err) {
    // The tool falls back to the stored rows; say why the live read failed.
    console.warn(`[fbLiveCampaignInsights] ${clientId}: ${errorMessage(err)}`);
    return null;
  }
}

const LIVE_CAMPAIGN_CALL_BUDGET = 30;
const LIVE_CAMPAIGN_MAX_PAGES = 10;
