import type { FacebookCampaignMutationArgs } from "./meta-campaign-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { assertCallerCanAccessClient } from "../../_shared/auth-helpers.ts";

/** Preserves the existing duplicate_facebook_campaign executor and side-effect order. */
export async function executeFacebookCampaignMutation(
  args: FacebookCampaignMutationArgs,
  context: ToolExecutionContext,
) {
  const {
    supabase,
    tenantId,
    agentId,
    callerRole,
    callerPhone,
    actorUserId,
    callerScope,
    name,
  } = context;

  await assertCallerCanAccessClient(
    supabase,
    args.client_id as string,
    callerScope,
  );
  if (!args.campaign_id) {
    return { error: "campaign_id נדרש" };
  }
  if (
    name === "toggle_facebook_campaign" &&
    !["ACTIVE", "PAUSED"].includes(args.status as string)
  ) {
    return { error: "status חייב להיות ACTIVE או PAUSED" };
  }
  if (
    name === "update_facebook_budget" &&
    args.daily_budget == null &&
    args.lifetime_budget == null
  ) {
    return { error: "daily_budget או lifetime_budget נדרש" };
  }
  const toggleLevel =
    args.level === "ad"
      ? "מודעה"
      : args.level === "adset"
        ? "ad set"
        : "קמפיין";
  const legacyTitles: Record<string, string> = {
    toggle_facebook_campaign:
      args.status === "PAUSED"
        ? `כיבוי ${toggleLevel} FB ${args.campaign_id}`
        : `הדלקת ${toggleLevel} FB ${args.campaign_id}`,
    update_facebook_budget: `שינוי תקציב FB ${args.campaign_id} → ${args.daily_budget ?? args.lifetime_budget}`,
    duplicate_facebook_campaign: `שכפול קמפיין FB ${args.campaign_id}`,
  };
  const { data: aqRow, error: aqErr } = await supabase
    .from("agent_approval_queue")
    .insert({
      tenant_id: tenantId,
      agent_id: agentId || null,
      requested_by: actorUserId,
      action_type: name,
      title: legacyTitles[name] || name,
      description:
        "פעולת mutating על Meta — דורשת אישור משתמש מפורש (תור אישורים)",
      tool_name: name,
      tool_input: args,
      context: {
        caller_role: callerRole,
        caller_phone: callerPhone,
        client_id: args.client_id,
      },
      status: "pending",
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("id")
    .single();
  if (aqErr) {
    throw aqErr;
  }
  return {
    pending_approval: true,
    approval_id: aqRow.id,
    action: name,
    summary: legacyTitles[name] || name,
    instruction_for_carmen:
      'הצג למשתמש בקצרה מה את עומדת לעשות ובקש אישור: "לאשר? (כן/לא)". אל תבצעי כלום עד שיגיע אישור — קוראת ל-execute_pending_approval רק אחרי תשובה חיובית.',
  };
}
