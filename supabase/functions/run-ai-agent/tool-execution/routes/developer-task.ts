import { bindToolRoute, type ToolRoute } from "../route.ts";
import { executeAssignTaskToCursor } from "../../executors/assign-task-to-cursor.ts";
import { executeFindDevTaskDuplicates } from "../../executors/find-dev-task-duplicates.ts";
import { executeCreateDevTask } from "../../executors/create-dev-task.ts";
import { executeApproveDevTask } from "../../executors/approve-dev-task.ts";
import { executeDispatchDevTask } from "../../executors/dispatch-dev-task.ts";
import { executeListDevTasks } from "../../executors/list-dev-tasks.ts";
import { executeUpdateDevTask } from "../../executors/update-dev-task.ts";
import { executeAttachDevTaskSession } from "../../executors/attach-dev-task-session.ts";

/** developer-task tool routes; argument assertions retain the legacy tool boundary. */
export const developerTaskRoutes: Record<string, ToolRoute> = {
  assign_task_to_cursor: bindToolRoute(executeAssignTaskToCursor),
  find_dev_task_duplicates: bindToolRoute(executeFindDevTaskDuplicates),
  create_dev_task: bindToolRoute(executeCreateDevTask),
  approve_dev_task: bindToolRoute(executeApproveDevTask),
  dispatch_dev_task: bindToolRoute(executeDispatchDevTask),
  list_dev_tasks: bindToolRoute(executeListDevTasks),
  update_dev_task: bindToolRoute(executeUpdateDevTask),
  attach_dev_task_session: bindToolRoute(executeAttachDevTaskSession),
};
