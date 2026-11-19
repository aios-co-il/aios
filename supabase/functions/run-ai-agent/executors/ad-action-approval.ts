import type { AdActionApprovalArgs } from "./ad-action-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing gads_update_budget executor and side-effect order. */
export async function queueAdActionApproval(
  args: AdActionApprovalArgs,
  context: ToolExecutionContext,
) {
  const {
    supabase,
    tenantId,
    agentId,
    callerRole,
    callerPhone,
    actorUserId,
    name,
  } = context;

  const titles: Record<string, string> = {
    fb_create_campaign: `יצירת קמפיין FB: ${args.name || ""}`,
    fb_create_adset: `יצירת ad set: ${args.name || ""}`,
    fb_create_ad: `יצירת מודעה: ${args.name || ""}`,
    fb_create_creative_from_media: `בניית קריאייטיב חדש מ-media`,
    fb_replace_lead_form: `החלפת טופס לידים במודעה ${args.ad_id}`,
    fb_update_budget: `שינוי תקציב ${args.entity_id} → ${args.daily_budget ?? args.lifetime_budget}`,
    fb_pause: `כיבוי ${args.entity_id}`,
    fb_resume: `הדלקה ${args.entity_id}`,
    gads_pause: `Google Ads — כיבוי ${args.campaign_id}`,
    gads_resume: `Google Ads — הדלקה ${args.campaign_id}`,
    gads_update_budget: `Google Ads — תקציב ${args.campaign_id} → ${args.daily_budget}`,
  };
  const { data, error } = await supabase
    .from("agent_approval_queue")
    .insert({
      tenant_id: tenantId,
      agent_id: agentId || null,
      requested_by: actorUserId,
      action_type: name,
      title: titles[name] || name,
      description: "פעולת mutating שדורשת אישור משתמש בוואטסאפ",
      tool_name: name,
      tool_input: args,
      context: { caller_role: callerRole, caller_phone: callerPhone },
      status: "pending",
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("id")
    .single();
  if (error) {
    throw error;
  }
  return {
    pending_approval: true,
    approval_id: data.id,
    action: name,
    summary: titles[name] || name,
    instruction_for_carmen:
      'הצג למשתמש בקצרה מה את עומדת לעשות ובקש אישור: "לאשר? (כן/לא)". אל תבצעי כלום עד שיגיע אישור — קוראת ל-execute_pending_approval רק אחרי תשובה חיובית.',
  };
}
