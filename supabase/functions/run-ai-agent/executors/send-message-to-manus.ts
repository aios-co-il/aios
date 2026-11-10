import type { SendMessageToManusArgs } from "./delegation-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing send_message_to_manus executor and side-effect order. */
export async function executeSendMessageToManus(
  args: SendMessageToManusArgs,
  context: ToolExecutionContext,
) {
  const { tenantId, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = context;

  const manusApiUrl = `${SUPABASE_URL}/functions/v1/manus-api`;
  const msgBody: {
    action: string;
    tenantId: string;
    message: string;
    task_id?: string;
  } = {
    action: "send_message",
    tenantId,
    message: args.message,
  };
  if (args.task_id) {
    msgBody.task_id = args.task_id;
  }
  const msgRes = await fetch(manusApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(msgBody),
  });
  if (!msgRes.ok) {
    const errText = await msgRes.text();
    throw new Error(`Manus send_message error [${msgRes.status}]: ${errText}`);
  }
  const msgData = await msgRes.json();
  return {
    success: true,
    task_id: msgData.task_id,
    message: "ההודעה נשלחה ל-Manus בהצלחה.",
  };
}
