import { REFRESH_PULSE_TOOL_NAME } from "../../_shared/carmen/pulse-tools.ts";
import { PULSE_TARGET_TOOL_NAMES } from "../../_shared/carmen/pulse-targets/tool-defs.ts";
import { NATIVE_DEV_TASK_TOOLS } from "../../_shared/dev-escalation-auth.ts";
import { WORKSHOP_TOOLS } from "../../_shared/workshop-tools.ts";
import type { LLMTarget } from "./contracts.ts";

export const OPENAI_MAX_TOOLS = 128;

export const LOW_PRIORITY_TOOLS = new Set([
  "send_message_to_manus",
  "get_subagent_result",
  "get_batch_results",
  "delegate_parallel",
  "duplicate_facebook_campaign",
  "sync_maskyoo_cdr",
  "create_supplier",
  "create_product",
  "create_sales_person",
  "create_agency",
  "prioritize_tasks",
  "propose_automation",
  "create_whatsapp_instance",
  "get_whatsapp_qr_link",
  "connect_google_ads_account",
  "save_media_from_chat",
]);

/** Preserves the existing isEscalationMcpTool provider boundary. */
export function isEscalationMcpTool(name: string | undefined): boolean {
  if (!name) {
    return false;
  }
  return (
    name.startsWith("mcp_Cursor__") ||
    name.startsWith("mcp_Claude__") ||
    name.startsWith("mcp_Manus__") ||
    name.startsWith("mcp_Grok__")
  );
}

/**
 * Tools that must survive OpenAI's 128-tool cap + the embedding router.
 * New Meta tools were previously defined near the end of ALL_TOOLS (~index 147)
 * and got sliced off whenever the router fell back to the full ~176-tool set.
 */
export const PRIORITY_TOOLS = new Set([
  "analyze_facebook_campaign",
  "list_facebook_ads",
  "inspect_facebook_ad",
  "fb_duplicate_ad_variants",
  "duplicate_facebook_ad_variants",
  "toggle_facebook_campaign",
  "list_facebook_campaigns",
  "get_facebook_campaign_data",
  "update_facebook_budget",
  "fb_pause",
  "fb_resume",
  "fb_update_budget",
  "execute_pending_approval",
  "reject_pending_approval",
  "list_pending_approvals",
  "join_meeting_for_client",
  "get_meeting_bot_status",
  // Staff WhatsApp — must survive the 128-tool cap (was late in ALL_TOOLS).
  "send_whatsapp_to_staff",
  "lookup_staff_whatsapp",
  "send_message_to_campaigner",
  "list_campaigners",
  "list_sales_people",
  "get_openai_billing_status",
  "connect_client_meta_ad_account",
  REFRESH_PULSE_TOOL_NAME,
  ...PULSE_TARGET_TOOL_NAMES,
  // Questions about Carmen herself: her personas and their portraits, on every surface.
  "get_carmen_skins",
  ...NATIVE_DEV_TASK_TOOLS,
  // Offered only inside the workshop skin, where they are the main tools.
  ...WORKSHOP_TOOLS.map((tool) => tool.name),
]);

/** Preserves the existing capToolsForTarget provider boundary. */
export function capToolsForTarget<T extends { function?: { name?: string } }>(
  target: LLMTarget,
  tools: Array<T>,
): Array<T> {
  if (target.provider !== "openai" || tools.length <= OPENAI_MAX_TOOLS) {
    return tools;
  }
  // Escalation MCP + PRIORITY Meta/approval tools must never be truncated.
  const mustKeepEscalation = tools.filter((t) =>
    isEscalationMcpTool(t?.function?.name),
  );
  const mustKeepPriority = tools.filter((t) => {
    const n = t?.function?.name;
    return !!n && PRIORITY_TOOLS.has(n) && !isEscalationMcpTool(n);
  });
  const kept = tools.filter((t) => {
    const n = t?.function?.name;
    if (!n || isEscalationMcpTool(n) || PRIORITY_TOOLS.has(n)) {
      return false;
    }
    return !LOW_PRIORITY_TOOLS.has(n);
  });
  const reserved = mustKeepEscalation.length + mustKeepPriority.length;
  const room = Math.max(0, OPENAI_MAX_TOOLS - reserved);
  const capped = [
    ...mustKeepEscalation,
    ...mustKeepPriority,
    ...kept.slice(0, room),
  ];
  console.log(
    `[AGENT] OpenAI tool cap: ${tools.length} → ${capped.length} (kept ${mustKeepEscalation.length} escalation MCP + ${mustKeepPriority.length} priority)`,
  );
  return capped;
}
