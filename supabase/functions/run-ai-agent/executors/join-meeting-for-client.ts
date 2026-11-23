import { invokeExecutorFunction } from "./invoke-executor-function.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing join_meeting_for_client executor and side-effect order. */
export async function executeJoinMeetingForClient(
  args: JoinMeetingForClientArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, userId } = context;

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

  const { data, ok, status } = await invokeExecutorFunction(
    supabase,
    "dispatch-meeting-bot",
    {
      meeting_url: String(meeting_url).trim(),
      client_id: client_id || null,
      lead_id: lead_id || null,
      campaigner_ids: Array.isArray(campaigner_ids) ? campaigner_ids : [],
      agency_id: agency_id || null,
      summary_scope: summary_scope || "auto",
      meeting_topic: meeting_topic || null,
      tenant_id: tenantId,
      created_by: userId,
    },
  );
  if (!ok) {
    return { error: data.error || `שגיאה בשליחת הבוט (${status})` };
  }
  return {
    success: true,
    session_id: data.session_id,
    bot_id: data.bot_id,
    platform: data.platform_label,
    message:
      data.message || "הבוט מצטרף לפגישה. אשרו אותו בחדר ההמתנה אם נדרש.",
  };
}

type JoinMeetingForClientArgs = {
  meeting_url: string;
  client_id?: string;
  lead_id?: string;
  campaigner_ids?: Array<string>;
  agency_id?: string;
  summary_scope?: "auto" | "client" | "lead" | "campaigner" | "agency";
  meeting_topic?: string;
};
