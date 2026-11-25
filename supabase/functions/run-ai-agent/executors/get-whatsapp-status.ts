import { assertGatewayLineAccess } from "./gateway-line-access.ts";
import { invokeExecutorFunction } from "./invoke-executor-function.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

type GetWhatsappStatusArgs = { integrationId: string };

export async function executeGetWhatsappStatus(
  args: GetWhatsappStatusArgs,
  context: ToolExecutionContext,
) {
  const { supabase } = context;

  await assertGatewayLineAccess(context, args.integrationId);
  const res = await invokeExecutorFunction(supabase, "manage-manus-wa", {
    action: "get_status",
    integrationId: args.integrationId,
  });
  const data = res.data;
  if (!res.ok) {
    return { error: data.error || `get_status failed [${res.status}]` };
  }
  return data;
}
