import type { FindDevTaskDuplicatesArgs } from "./developer-task-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { findDuplicateDevTasks } from "../../_shared/dev-tasks.ts";

/** Preserves the existing find_dev_task_duplicates executor and side-effect order. */
export async function executeFindDevTaskDuplicates(
  args: FindDevTaskDuplicatesArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;

  const title = String(args.title || "").trim();
  if (!title) {
    return { duplicates: [] };
  }
  const duplicates = await findDuplicateDevTasks(supabase, tenantId, title);
  return {
    duplicates: duplicates.map((d) => ({
      id: d.task.id,
      title: d.task.title,
      status: d.task.status,
      score: d.score,
      cursor_session_url: d.task.cursor_session_url,
    })),
  };
}
