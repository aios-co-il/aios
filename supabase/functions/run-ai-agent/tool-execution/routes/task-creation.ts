import { bindToolRoute, type ToolRoute } from "../route.ts";
import { executeCreateTask } from "../../executors/create-task.ts";
import { executeCreateAgentTask } from "../../executors/create-agent-task.ts";

export const taskCreationRoutes: Record<string, ToolRoute> = {
  create_task: bindToolRoute(executeCreateTask),
  create_agent_task: bindToolRoute(executeCreateAgentTask),
};
