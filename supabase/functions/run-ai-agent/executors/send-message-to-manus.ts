import { invokeExecutorFunction } from "./invoke-executor-function.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

type SendMessageToManusArgs = { message: string; task_id?: string };

export async function executeSendMessageToManus(
  args: SendMessageToManusArgs,
  context: ToolExecutionContext,
) {
  const { tenantId, supabase } = context;

  const msgBody: {
    action: string;
    tenantId: string;
    message: string;
    taskId?: string;
  } = {
    action: "send_message",
    tenantId,
    message: args.message,
  };
  if (args.task_id) {
    msgBody.taskId = args.task_id;
  }
  const msgRes = await invokeExecutorFunction(
    supabase,
    "manus-api",
    msgBody,
    "text",
  );
  if (!msgRes.ok) {
    const errText = msgRes.data;
    throw new Error(`Manus send_message error [${msgRes.status}]: ${errText}`);
  }
  const msgData =
    typeof msgRes.data === "string" ? JSON.parse(msgRes.data) : msgRes.data;
  return {
    success: true,
    task_id: msgData.task_id,
    message: "ההודעה נשלחה ל-Manus בהצלחה.",
  };
}
