import { bindToolRoute, type ToolRoute } from "../route.ts";
import { executeListMyAgentTasks } from "../../executors/list-my-agent-tasks.ts";
import { executeSearchTasks } from "../../executors/search-tasks.ts";
import { executeListTasks } from "../../executors/list-tasks.ts";

/** task-queries tool routes; argument assertions retain the legacy tool boundary. */
export const taskQueriesRoutes: Record<string, ToolRoute> = {
  list_my_agent_tasks: bindToolRoute(executeListMyAgentTasks),
  search_tasks: bindToolRoute(executeSearchTasks),
  list_tasks: bindToolRoute(executeListTasks),
};
