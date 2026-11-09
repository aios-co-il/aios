import { bindToolRoute, type ToolRoute } from "../route.ts";
import { executeCreateGoal } from "../../executors/create-goal.ts";
import { executeListGoals } from "../../executors/list-goals.ts";
import { executeFindExecutionGoalDuplicates } from "../../executors/find-execution-goal-duplicates.ts";
import { executeCreateExecutionGoal } from "../../executors/create-execution-goal.ts";
import { executeGetExecutionGoalReport } from "../../executors/get-execution-goal-report.ts";
import { executeAddGoalMilestone } from "../../executors/add-goal-milestone.ts";
import { executeAddGoalBlocker } from "../../executors/add-goal-blocker.ts";
import { executeLinkTaskToExecutionGoal } from "../../executors/link-task-to-execution-goal.ts";
import { executeGetAutonomousGoalStatus } from "../../executors/get-autonomous-goal-status.ts";

/** goal tool routes; argument assertions retain the legacy tool boundary. */
export const goalRoutes: Record<string, ToolRoute> = {
  create_goal: bindToolRoute(executeCreateGoal),
  list_goals: bindToolRoute(executeListGoals),
  find_execution_goal_duplicates: bindToolRoute(
    executeFindExecutionGoalDuplicates,
  ),
  create_execution_goal: bindToolRoute(executeCreateExecutionGoal),
  create_autonomous_goal: bindToolRoute(executeCreateExecutionGoal),
  get_execution_goal_report: bindToolRoute(executeGetExecutionGoalReport),
  add_goal_milestone: bindToolRoute(executeAddGoalMilestone),
  add_goal_blocker: bindToolRoute(executeAddGoalBlocker),
  link_task_to_execution_goal: bindToolRoute(executeLinkTaskToExecutionGoal),
  get_autonomous_goal_status: bindToolRoute(executeGetAutonomousGoalStatus),
};
