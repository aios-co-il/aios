import { loadAccountHealthClients } from "./account-health-scope.ts";
import { loadAccountHealthMeta } from "./account-health-meta.ts";
import { loadAccountHealthSpend } from "./account-health-spend.ts";
import type { CheckAdAccountsHealthArgs } from "./ad-report-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

import type { MetaAdSettings } from "../tool-storage-contracts.ts";
import { readMetaAdSettings } from "../tool-storage-contracts.ts";

import type { AdAccountHealthIssue } from "../tool-contracts-admin.ts";

/** Preserves the existing check_ad_accounts_health executor and side-effect order. */
export async function executeCheckAdAccountsHealth(
  args: CheckAdAccountsHealthArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds } = context;

  // 1. Resolve client scope: own tenant + shared-agency clients only (see
  // analyze_campaign_performance — same cross-tenant flooding hazard).
  const db = supabase;
  const scopeClients = await loadAccountHealthClients(args, context);
  const clientIds = (scopeClients || []).map((c) => c.id);
  if (clientIds.length === 0) {
    return {
      count: 0,
      healthy: 0,
      unhealthy: [],
      note: "no clients in scope",
    };
  }

  // 2. Find facebook_insights tables (which contain ad_account_id) for these clients
  const { data: fbTables } = await db
    .from("crm_tables")
    .select("client_id, integration_settings")
    .in("tenant_id", accessibleTenantIds)
    .in("client_id", clientIds)
    .eq("integration_type", "facebook_insights");

  const fbTableByClient = new Map<string | null, MetaAdSettings>();
  for (const t of fbTables || []) {
    fbTableByClient.set(
      t.client_id,
      readMetaAdSettings(t.integration_settings),
    );
  }

  // 3. Fetch Facebook access token (tenant integration)
  const { accountStatusById, tokenOk } = await loadAccountHealthMeta(context);

  // 5. Compute spend_7d per client from facebook_insights records
  const { settingsByClient, spendByClient } = await loadAccountHealthSpend(
    clientIds,
    context,
  );
  const unhealthy: Array<AdAccountHealthIssue> = [];
  let healthy = 0;
  for (const c of scopeClients || []) {
    const settings = settingsByClient.get(c.id);
    const adAccountId =
      settings?.ad_account_id ||
      (c.meta_ads_account_id
        ? String(c.meta_ads_account_id).replace(/^act_/, "")
        : null);
    const flags: Array<string> = [];
    let status: string = "unknown";
    let hasSpend7 = false;
    let allPaused = false;
    const sb = spendByClient.get(c.id);
    if (sb) {
      hasSpend7 = sb.spend7 > 0;
      allPaused = sb.activeCount === 0 && sb.pausedCount > 0;
    }
    if (!adAccountId) {
      flags.push("not_connected");
    } else if (!tokenOk) {
      flags.push("fb_token_expired");
      status = "token_expired";
    } else {
      const acct =
        accountStatusById.get(String(adAccountId)) ||
        accountStatusById.get(
          `act_${String(adAccountId).replace(/^act_/, "")}`,
        );
      if (!acct) {
        flags.push("account_not_found");
        status = "not_found";
      } else {
        // Meta: 1=ACTIVE, 2=DISABLED, 3=UNSETTLED, 7=PENDING_RISK_REVIEW, 8=PENDING_SETTLEMENT, 9=IN_GRACE_PERIOD, 100=PENDING_CLOSURE, 101=CLOSED, 102=PENDING_REVIEW, 201=ANY_ACTIVE
        const s = acct.status;
        status =
          s === 1
            ? "active"
            : s === 2
              ? "disabled"
              : s === 101
                ? "closed"
                : s === 7 || s === 102
                  ? "pending_review"
                  : `status_${s}`;
        if (s !== 1) {
          flags.push(`fb_${status}`);
        }
      }
    }
    if (status === "active" && !hasSpend7) {
      flags.push("no_spend_7d");
    }
    if (status === "active" && allPaused) {
      flags.push("all_campaigns_paused");
    }

    if (flags.length === 0) {
      healthy += 1;
    } else {
      unhealthy.push({
        client_id: c.id,
        client_name: c.name,
        agency_name: c.agencies?.name ?? null,
        ad_account_id: adAccountId,
        fb: {
          status,
          has_spend_7d: hasSpend7,
          all_paused: allPaused,
          token_ok: tokenOk,
        },
        flags,
      });
    }
  }

  return {
    count: scopeClients?.length || 0,
    healthy,
    unhealthy_count: unhealthy.length,
    token_ok: tokenOk,
    unhealthy,
    instructions_to_agent:
      unhealthy.length > 0
        ? 'דווחי על כל הלקוחות הבעייתיים בבלוק "🚨 חשבונות מודעות לא תקינים". לכל אחד פרטי בעברית את ה-flag הראשי. אם token_ok=false — ציינו בנפרד שצריך לחבר מחדש את אינטגרציית פייסבוק.'
        : "כל החשבונות תקינים. החזירי משפט קצר אחד.",
  };
}
