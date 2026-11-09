import type { AgentDatabaseClient } from "../database-contracts.ts";
import { resolveOpenAiAdminKey } from "./billing-key.ts";
import { monthUtcBounds } from "../../_shared/openai-billing.ts";
import { openaiAdminGet } from "../openai-admin-get.ts";
import { buildOpenAiBillingStatus } from "../../_shared/openai-billing.ts";
import { formatOpenAiBillingWhatsApp } from "../../_shared/openai-billing.ts";

/** Preserves the existing fetchOpenAiBillingStatus provider boundary. */
export async function fetchOpenAiBillingStatus(args: {
  supabase: AgentDatabaseClient;
  tenantId: string;
  includeTokens?: boolean;
}) {
  const { supabase, tenantId } = args;
  const includeTokens = args.includeTokens !== false;
  const { key, source } = await resolveOpenAiAdminKey(supabase, tenantId);
  if (!key) {
    return {
      ok: false,
      error:
        "חסר מפתח Admin של OpenAI. הגדירי את הסוד OPENAI_ADMIN_KEY ב-Supabase, או את openai_admin_api_key באינטגרציית llm. מפתח sk- רגיל לא מספיק ל-Costs/Usage Admin API.",
      remaining_credit: null,
      remaining_credit_available: false,
      remaining_credit_reason: "Admin API key missing",
      setup: {
        dashboard_admin_keys:
          "https://platform.openai.com/settings/organization/admin-keys",
        billing_dashboard:
          "https://platform.openai.com/settings/organization/billing",
      },
      summary_he:
        "אין מפתח Admin — לא ניתן לשלוף שימוש/עלויות OpenAI מה-API. יתרת קרדיט ממילא לא זמינה ב-API הרשמי.",
    };
  }

  const period = monthUtcBounds();
  // Paginate costs for the whole month (limit 31 daily buckets).
  const costsQs = `start_time=${period.start_time}&end_time=${period.end_time}&bucket_width=1d&limit=31`;
  const costsRes = await openaiAdminGet(`/organization/costs?${costsQs}`, key);

  let usageRes: {
    ok: boolean;
    status: number;
    json: unknown;
    error?: string;
  } | null = null;
  if (includeTokens) {
    usageRes = await openaiAdminGet(
      `/organization/usage/completions?${costsQs}`,
      key,
    );
  }

  // Best-effort spend limits (endpoint may 404 depending on account).
  const limitsRes = await openaiAdminGet(`/organization/spend_limits`, key);
  const limitsAlt = !limitsRes.ok
    ? await openaiAdminGet(`/organization/spend_limit`, key)
    : null;
  const spend = limitsRes.ok
    ? limitsRes
    : limitsAlt?.ok
      ? limitsAlt
      : limitsRes;

  const status = buildOpenAiBillingStatus({
    costs: costsRes.ok ? costsRes.json : null,
    usage: usageRes?.ok ? usageRes.json : null,
    spendLimits: spend.ok ? spend.json : null,
    costsError: costsRes.ok ? null : costsRes.error,
    usageError: usageRes && !usageRes.ok ? usageRes.error : null,
    spendLimitsError: spend.ok ? null : spend.error,
    period,
    authSource: source,
  });

  const summary_he = formatOpenAiBillingWhatsApp(status);
  // Never echo key material
  return { ...status, summary_he };
}
