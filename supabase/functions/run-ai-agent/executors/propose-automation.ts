import type { ProposeAutomationArgs } from "./automation-tool-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { automationStepArg } from "../tool-contracts-admin.ts";

/** Preserves the existing propose_automation executor and side-effect order. */
export async function executeProposeAutomation(
  args: ProposeAutomationArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, agentId, callerRole, callerPhone, actorUserId } =
    context;

  if (
    !args.name ||
    !args.trigger_type ||
    !Array.isArray(args.steps) ||
    args.steps.length === 0
  ) {
    throw new Error("name, trigger_type ו-steps (מערך לא ריק) נדרשים");
  }
  const stepArgs: Array<unknown> = args.steps;
  const spec = {
    name: String(args.name),
    description: args.description ? String(args.description) : null,
    trigger_type: String(args.trigger_type),
    trigger_config:
      args.trigger_config && typeof args.trigger_config === "object"
        ? args.trigger_config
        : {},
    steps: stepArgs
      .slice(0, 20)
      .map(automationStepArg)
      .map((s) => ({
        type: s.type || "agent",
        skin: s.skin || null,
        instruction: s.instruction || null,
        action_type: s.action_type || null,
        config: s.config && typeof s.config === "object" ? s.config : {},
        label: s.label || null,
      })),
  };
  const stepSummary = spec.steps
    .map(
      (s, i) => `${i + 1}. ${s.label || s.type}${s.skin ? ` [${s.skin}]` : ""}`,
    )
    .join("  ·  ");
  const { data, error } = await supabase
    .from("agent_approval_queue")
    .insert({
      tenant_id: tenantId,
      agent_id: agentId || null,
      requested_by: actorUserId,
      action_type: "create_automation",
      title: `בניית אוטומציה: ${spec.name}`,
      description: `טריגר: ${spec.trigger_type} | שלבים: ${stepSummary}`,
      tool_name: "create_automation",
      tool_input: spec,
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
    summary: `אוטומציה "${spec.name}" — ${spec.steps.length} שלבים`,
    instruction_for_carmen:
      "הצג למשתמש את התכנון (טריגר + שלבים) ובקש אישור. האוטומציה תיווצר כבויה רק לאחר אישור; אל תפעילי אותה — המשתמש יבדוק ויפעיל בעצמו.",
  };
}
