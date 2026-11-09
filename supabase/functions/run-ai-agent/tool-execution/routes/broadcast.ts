import { bindToolRoute, type ToolRoute } from "../route.ts";
import { executeListBroadcasts } from "../../executors/list-broadcasts.ts";
import { executeCreateBroadcast } from "../../executors/create-broadcast.ts";
import { executeSendBroadcastNow } from "../../executors/send-broadcast-now.ts";
import { executeScheduleBroadcast } from "../../executors/schedule-broadcast.ts";
import { executeCancelBroadcast } from "../../executors/cancel-broadcast.ts";

/** broadcast tool routes; argument assertions retain the legacy tool boundary. */
export const broadcastRoutes: Record<string, ToolRoute> = {
  list_broadcasts: bindToolRoute(executeListBroadcasts),
  create_broadcast: bindToolRoute(executeCreateBroadcast),
  send_broadcast_now: bindToolRoute(executeSendBroadcastNow),
  schedule_broadcast: bindToolRoute(executeScheduleBroadcast),
  cancel_broadcast: bindToolRoute(executeCancelBroadcast),
};
