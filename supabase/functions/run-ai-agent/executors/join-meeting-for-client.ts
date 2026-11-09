import type { JoinMeetingForClientArgs } from "./calendar-tool-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing join_meeting_for_client executor and side-effect order. */
export async function executeJoinMeetingForClient(
  args: JoinMeetingForClientArgs,
  context: ToolExecutionContext,
) {
  const { tenantId, userId, SUPABASE_URL } = context;

  const {
    meeting_url,
    client_id,
    lead_id,
    campaigner_ids,
    agency_id,
    summary_scope,
    meeting_topic,
  } = args;
  if (!meeting_url?.trim()) {
    return { error: "meeting_url נדרש — קישור Zoom / Google Meet / Teams" };
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/dispatch-meeting-bot`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify({
      meeting_url: String(meeting_url).trim(),
      client_id: client_id || null,
      lead_id: lead_id || null,
      campaigner_ids: Array.isArray(campaigner_ids) ? campaigner_ids : [],
      agency_id: agency_id || null,
      summary_scope: summary_scope || "auto",
      meeting_topic: meeting_topic || null,
      tenant_id: tenantId,
      created_by: userId,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    return { error: data.error || `שגיאה בשליחת הבוט (${res.status})` };
  }
  return {
    success: true,
    session_id: data.session_id,
    bot_id: data.bot_id,
    platform: data.platform_label,
    message:
      data.message || "כרמן מצטרפת לפגישה. אשרו אותה בחדר ההמתנה אם נדרש.",
  };
}
