import { bindToolRoute, type ToolRoute } from "../route.ts";
import { executeListMyAgentTasks } from "../../executors/list-my-agent-tasks.ts";
import { executeSearchTasks } from "../../executors/search-tasks.ts";
import { executeListTasks } from "../../executors/list-tasks.ts";

export const taskQueriesRoutes: Record<string, ToolRoute> = {
  list_my_agent_tasks: bindToolRoute(executeListMyAgentTasks),
  search_tasks: bindToolRoute(executeSearchTasks),
  list_tasks: bindToolRoute(executeListTasks),
};
