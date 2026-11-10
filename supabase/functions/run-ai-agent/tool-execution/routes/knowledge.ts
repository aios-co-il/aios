import { bindToolRoute, type ToolRoute } from "../route.ts";
import { executeKbListFolder } from "../../executors/kb-list-folder.ts";
import { executeKbSearch } from "../../executors/kb-search.ts";
import { executeKbOpen } from "../../executors/kb-open.ts";
import { executeKbRecallConversation } from "../../executors/kb-recall-conversation.ts";
import { executeKbLearn } from "../../executors/kb-learn.ts";

/** knowledge tool routes; argument assertions retain the legacy tool boundary. */
export const knowledgeRoutes: Record<string, ToolRoute> = {
  kb_list_folder: bindToolRoute(executeKbListFolder),
  kb_search: bindToolRoute(executeKbSearch),
  kb_open: bindToolRoute(executeKbOpen),
  kb_recall_conversation: bindToolRoute(executeKbRecallConversation),
  kb_learn: bindToolRoute(executeKbLearn),
};
