import { bindToolRoute, type ToolRoute } from "../route.ts";
import { executeSaveMediaFromChat } from "../../executors/save-media-from-chat.ts";
import { executeListClientMedia } from "../../executors/list-client-media.ts";

/** media-record tool routes; argument assertions retain the legacy tool boundary. */
export const mediaRecordRoutes: Record<string, ToolRoute> = {
  save_media_from_chat: bindToolRoute(executeSaveMediaFromChat),
  list_client_media: bindToolRoute(executeListClientMedia),
};
