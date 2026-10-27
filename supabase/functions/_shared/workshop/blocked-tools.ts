/**
 * Tools never offered or run in the workshop chat. The workshop makes things on its board and
 * approves only its own budget; anything that acts outside the board (publishing, messaging
 * people, ad changes, deletes, background runs) happens outside the workshop.
 */

/** The approval queue: a workshop tap is not an approval of a WhatsApp/Meta action. */
const APPROVAL_TOOLS = [
  "execute_pending_approval",
  "reject_pending_approval",
  "list_pending_approvals",
];

const OUTSIDE_TOOLS = [
  // Publishes or posts on social pages and Meta (posts, comment replies, lead forms).
  "publish_social_post",
  "reply_to_social_comment",
  "hide_social_comment",
  "create_meta_lead_form",
  // Sends messages to people: WhatsApp, broadcasts, calendar invites, a meeting bot.
  "send_message",
  "send_whatsapp_to_staff",
  "send_message_to_campaigner",
  "send_whatsapp_via_gateway",
  "create_broadcast",
  "send_broadcast_now",
  "schedule_broadcast",
  "cancel_broadcast",
  "send_calendar_invite",
  "update_calendar_invite",
  "cancel_calendar_invite",
  "join_meeting_for_client",
  // Task updates and collaborators WhatsApp the task's staff (trigger-automation).
  "add_task_update",
  "manage_task_collaborators",
  // Creates or changes ad campaigns, ads and budgets on Meta and Google Ads.
  "toggle_facebook_campaign",
  "update_facebook_budget",
  "duplicate_facebook_campaign",
  "fb_duplicate_ad_variants",
  "duplicate_facebook_ad_variants",
  "fb_create_campaign",
  "fb_create_adset",
  "fb_create_creative_from_media",
  "fb_create_ad",
  "fb_replace_lead_form",
  "fb_update_budget",
  "fb_pause",
  "fb_resume",
  "gads_pause",
  "gads_resume",
  "gads_update_budget",
  "schedule_campaign_toggle",
  "cancel_campaign_schedule",
  // Deletes or bulk-edits CRM and finance data.
  "delete_lead",
  "delete_task",
  "batch_update_client_health",
  "delete_one_time_income",
  "delete_income_payment",
  "delete_expense_payment",
  // Edits marketing work items generically: the workshop changes its items through workshop_* only.
  "update_marketing_work_item",
  "handoff_marketing_work_item",
  // Creates or changes automations and background runs that act later, outside the workshop.
  "create_agent_task",
  "propose_automation",
  "propose_automation_edit",
  "toggle_automation",
  "delete_automation",
  "set_automation_meta_lead_form",
  "delegate_to_subagent",
  "delegate_parallel",
  "delegate_to_manus",
  "send_message_to_manus",
  // Starts a goal loop that a background worker runs later.
  "create_autonomous_goal",
  "create_execution_goal",
  // Sends a CRM task to Cursor at once; in the workshop a dev task waits for the user's yes.
  "assign_task_to_cursor",
];

const WORKSHOP_BLOCKED_TOOLS = new Set([...APPROVAL_TOOLS, ...OUTSIDE_TOOLS]);
const APPROVAL_TOOL_SET = new Set(APPROVAL_TOOLS);

/**
 * Tenant connector tools (mcp_<Connector>__*): Gmail, WordPress, Meta Ads, SQL and others can
 * send, publish or change things, and none of them goes through the workshop's approval.
 */
const MCP_TOOL_PREFIX = "mcp_";
/** Hand-offs to subagents and outside agents (Manus, the GitHub agent) run outside the board. */
const DELEGATE_TOOL_PREFIX = "delegate_";

export const isBlockedInWorkshop = (toolName: string, inWorkshop: boolean) =>
  inWorkshop &&
  (WORKSHOP_BLOCKED_TOOLS.has(toolName) ||
    toolName.startsWith(MCP_TOOL_PREFIX) ||
    toolName.startsWith(DELEGATE_TOOL_PREFIX));

/** The tool result Carmen gets when she calls a blocked tool from the workshop. */
export function workshopBlockedResult(toolName: string) {
  return {
    error: "not_in_workshop",
    message: APPROVAL_TOOL_SET.has(toolName)
      ? "אישורים של וואטסאפ ומטא לא מטופלים מהסדנה. המשיכי בעבודה על הפרויקט."
      : "מהסדנה לא מפרסמים, לא שולחים הודעות ולא משנים דברים מחוץ ללוח. אמרי למשתמש שאת זה עושים מחוץ לסדנה, והמשיכי בעבודה על הפרויקט.",
  };
}

/** Payload keys only the workshop's own server code writes (budget approval, project state). */
const SERVER_ONLY_PAYLOAD_KEYS = ["workshop_budget", "workshop"];

/** Drops server-only keys from a work item payload patch; says which were dropped. */
export function stripServerOnlyPayloadKeys(patch: Record<string, unknown>) {
  const kept: Record<string, unknown> = {};
  const dropped: string[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (SERVER_ONLY_PAYLOAD_KEYS.includes(key)) dropped.push(key);
    else kept[key] = value;
  }
  return { patch: kept, dropped };
}
