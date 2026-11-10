import type { ProposeAutomationEditArgs } from "./automation-tool-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing propose_automation_edit executor and side-effect order. */
export async function executeProposeAutomationEdit(
  args: ProposeAutomationEditArgs & { active?: boolean },
  context: ToolExecutionContext,
) {
  const {
    supabase,
    tenantId,
    agentId,
    callerRole,
    callerPhone,
    actorUserId,
    accessibleTenantIds,
    name,
  } = context;

  if (!args.automation_id) {
    return { error: "automation_id נדרש" };
  }
  const { data: auto } = await supabase
    .from("automations")
    .select("id, name, active")
    .eq("id", args.automation_id)
    .in("tenant_id", accessibleTenantIds)
    .maybeSingle();
  if (!auto) {
    return { error: "אוטומציה לא נמצאה" };
  }
  const autoTitles: Record<string, string> = {
    toggle_automation: `${args.active ? "הפעלת" : "כיבוי"} אוטומציה: ${auto.name}`,
    delete_automation: `מחיקת אוטומציה: ${auto.name}`,
    propose_automation_edit: `עריכת אוטומציה: ${auto.name}`,
  };
  const toolName =
    name === "propose_automation_edit" ? "edit_automation" : name;
  const { data: aqRow, error: aqErr } = await supabase
    .from("agent_approval_queue")
    .insert({
      tenant_id: tenantId,
      agent_id: agentId || null,
      requested_by: actorUserId,
      action_type: toolName,
      title: autoTitles[name] || name,
      description: "פעולת אוטומציה — דורשת אישור משתמש מפורש",
      tool_name: toolName,
      tool_input: args,
      context: {
        caller_role: callerRole,
        caller_phone: callerPhone,
        automation_name: auto.name,
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
    action: toolName,
    summary: autoTitles[name] || name,
    instruction_for_carmen:
      'הצג למשתמש מה ישתנה באוטומציה ובקש אישור: "לאשר? (כן/לא)". אל תבצעי עד execute_pending_approval.',
  };
}
