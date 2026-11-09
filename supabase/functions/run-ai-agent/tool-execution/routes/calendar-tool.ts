import { bindToolRoute, type ToolRoute } from "../route.ts";
import { executeSendCalendarInvite } from "../../executors/send-calendar-invite.ts";
import { executeListCalendarEvents } from "../../executors/list-calendar-events.ts";
import { executeUpdateCalendarInvite } from "../../executors/update-calendar-invite.ts";
import { executeCancelCalendarInvite } from "../../executors/cancel-calendar-invite.ts";
import { executeJoinMeetingForClient } from "../../executors/join-meeting-for-client.ts";
import { executeGetMeetingBotStatus } from "../../executors/get-meeting-bot-status.ts";

/** calendar-tool tool routes; argument assertions retain the legacy tool boundary. */
export const calendarToolRoutes: Record<string, ToolRoute> = {
  send_calendar_invite: bindToolRoute(executeSendCalendarInvite),
  list_calendar_events: bindToolRoute(executeListCalendarEvents),
  update_calendar_invite: bindToolRoute(executeUpdateCalendarInvite),
  cancel_calendar_invite: bindToolRoute(executeCancelCalendarInvite),
  join_meeting_for_client: bindToolRoute(executeJoinMeetingForClient),
  get_meeting_bot_status: bindToolRoute(executeGetMeetingBotStatus),
};
