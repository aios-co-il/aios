import type { GetMeetingBotStatusArgs } from "./calendar-tool-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing get_meeting_bot_status executor and side-effect order. */
export async function executeGetMeetingBotStatus(
  args: GetMeetingBotStatusArgs,
  context: ToolExecutionContext,
) {
  const { supabase, accessibleTenantIds } = context;

  const { session_id, bot_id } = args;
  if (!session_id && !bot_id) {
    return { error: "session_id או bot_id נדרש" };
  }

  let q = supabase
    .from("meeting_bot_sessions")
    .select(
      "id, status, status_detail, platform, meeting_topic, meeting_url, client_id, zoom_recording_id, error, joined_at, ended_at, created_at, external_bot_id",
    )
    .in("tenant_id", accessibleTenantIds);
  if (session_id) {
    q = q.eq("id", session_id);
  } else {
    q = q.eq("external_bot_id", bot_id as string);
  }

  const { data: session, error } = await q.maybeSingle();
  if (error) {
    return { error: error.message };
  }
  if (!session) {
    return { error: "לא נמצאה פגישת בוט" };
  }

  const statusLabels: Record<string, string> = {
    scheduled: "מתוזמנת",
    joining: "מצטרפת",
    waiting_room: "בחדר המתנה — אשרו את כרמן",
    in_meeting: "בפגישה ומקליטה",
    processing: "מעבדת תמלול וסיכום",
    done: "הסתיימה — סיכום מוכן",
    failed: "נכשלה",
    cancelled: "בוטלה",
  };

  return {
    session_id: session.id,
    bot_id: session.external_bot_id,
    status: session.status,
    status_label: statusLabels[session.status] || session.status,
    platform: session.platform,
    meeting_topic: session.meeting_topic,
    client_id: session.client_id,
    recording_id: session.zoom_recording_id,
    error: session.error,
    joined_at: session.joined_at,
    ended_at: session.ended_at,
  };
}
