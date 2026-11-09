import { bindToolRoute, type ToolRoute } from "../route.ts";
import { executeRecallRecentAction } from "../../executors/recall-recent-action.ts";
import { executeRecordActionEpisode } from "../../executors/record-action-episode.ts";
import { executeSaveMemory } from "../../executors/save-memory.ts";
import { executeRecallMemory } from "../../executors/recall-memory.ts";
import { executeRecallMemoryFts } from "../../executors/recall-memory-fts.ts";
import { executeDeleteMemory } from "../../executors/delete-memory.ts";

/** memory tool routes; argument assertions retain the legacy tool boundary. */
export const memoryRoutes: Record<string, ToolRoute> = {
  recall_recent_action: bindToolRoute(executeRecallRecentAction),
  record_action_episode: bindToolRoute(executeRecordActionEpisode),
  save_memory: bindToolRoute(executeSaveMemory),
  recall_memory: bindToolRoute(executeRecallMemory),
  recall_memory_fts: bindToolRoute(executeRecallMemoryFts),
  delete_memory: bindToolRoute(executeDeleteMemory),
};
