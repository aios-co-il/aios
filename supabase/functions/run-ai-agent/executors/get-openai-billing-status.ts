import { fetchOpenAiBillingStatus } from "../llm/billing-status.ts";
import type { GetOpenaiBillingStatusArgs } from "./billing-tool-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { isSuperAdminRole } from "../../_shared/openai-billing.ts";
import { OPENAI_BILLING_REFUSAL_HE } from "../../_shared/openai-billing.ts";
import { redactSecretsFromText } from "../../_shared/openai-billing.ts";
import { errorMessage } from "../error-message.ts";

/** Preserves the existing get_openai_billing_status executor and side-effect order. */
export async function executeGetOpenaiBillingStatus(
  args: GetOpenaiBillingStatusArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, callerRole } = context;

  if (!isSuperAdminRole(callerRole)) {
    return { error: OPENAI_BILLING_REFUSAL_HE, allowed: false };
  }
  try {
    return await fetchOpenAiBillingStatus({
      supabase,
      tenantId,
      includeTokens: args.include_tokens !== false,
    });
  } catch (e) {
    return {
      ok: false,
      error: redactSecretsFromText(errorMessage(e) || "openai billing failed"),
      remaining_credit: null,
      remaining_credit_available: false,
      summary_he: "שגיאה בשליפת סטטוס חיוב OpenAI.",
    };
  }
}
