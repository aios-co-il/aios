import { bindToolRoute, type ToolRoute } from "../route.ts";
import { executeUpdateTaskStatus } from "../../executors/update-task-status.ts";
import { executeUpdateTask } from "../../executors/update-task.ts";
import { executeDeleteTask } from "../../executors/delete-task.ts";
import { executeAddTaskUpdate } from "../../executors/add-task-update.ts";
import { executeManageTaskCollaborators } from "../../executors/manage-task-collaborators.ts";
import { executeTakeTask } from "../../executors/take-task.ts";
import { executeCompleteTaskStep } from "../../executors/complete-task-step.ts";
import { executePrioritizeTasks } from "../../executors/prioritize-tasks.ts";

/** task-mutations tool routes; argument assertions retain the legacy tool boundary. */
export const taskMutationsRoutes: Record<string, ToolRoute> = {
  update_task_status: bindToolRoute(executeUpdateTaskStatus),
  update_task: bindToolRoute(executeUpdateTask),
  delete_task: bindToolRoute(executeDeleteTask),
  add_task_update: bindToolRoute(executeAddTaskUpdate),
  manage_task_collaborators: bindToolRoute(executeManageTaskCollaborators),
  take_task: bindToolRoute(executeTakeTask),
  complete_task_step: bindToolRoute(executeCompleteTaskStep),
  prioritize_tasks: bindToolRoute(executePrioritizeTasks),
};
