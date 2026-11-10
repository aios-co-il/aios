import { bindToolRoute, type ToolRoute } from "../route.ts";
import { executeSendMessage } from "../../executors/send-message.ts";
import { executeListWaGroups } from "../../executors/list-wa-groups.ts";
import { executeLookupStaffWhatsapp } from "../../executors/lookup-staff-whatsapp.ts";
import { executeSendMessageToCampaigner } from "../../executors/send-message-to-campaigner.ts";
import { executeGetMaskyooCallsReport } from "../../executors/get-maskyoo-calls-report.ts";
import { executeSyncMaskyooCdr } from "../../executors/sync-maskyoo-cdr.ts";

/** messaging tool routes; argument assertions retain the legacy tool boundary. */
export const messagingRoutes: Record<string, ToolRoute> = {
  send_message: bindToolRoute(executeSendMessage),
  list_wa_groups: bindToolRoute(executeListWaGroups),
  lookup_staff_whatsapp: bindToolRoute(executeLookupStaffWhatsapp),
  send_whatsapp_to_staff: bindToolRoute(executeSendMessageToCampaigner),
  send_message_to_campaigner: bindToolRoute(executeSendMessageToCampaigner),
  get_maskyoo_calls_report: bindToolRoute(executeGetMaskyooCallsReport),
  sync_maskyoo_cdr: bindToolRoute(executeSyncMaskyooCdr),
};
