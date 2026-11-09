import type { AttachDevTaskSessionArgs } from "./developer-task-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { attachDevTaskSession } from "../../_shared/dev-tasks.ts";

/** Preserves the existing attach_dev_task_session executor and side-effect order. */
export async function executeAttachDevTaskSession(
  args: AttachDevTaskSessionArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, actorUserId } = context;

  const task = await attachDevTaskSession(supabase, {
    tenantId,
    taskId: String(args.dev_task_id),
    cursorSessionId: String(args.cursor_session_id),
    cursorSessionUrl: args.cursor_session_url,
    actorUserId,
  });
  return { task };
}
