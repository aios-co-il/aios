import { invokeExecutorFunction } from "./invoke-executor-function.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

type CreateWhatsappInstanceArgs = {
  displayName: string;
  countryCode?: string;
};

/** Preserves the existing create_whatsapp_instance executor and side-effect order. */
export async function executeCreateWhatsappInstance(
  args: CreateWhatsappInstanceArgs,
  context: ToolExecutionContext,
) {
  const { tenantId, supabase } = context;

  const res = await invokeExecutorFunction(supabase, "manage-manus-wa", {
    action: "create_instance",
    tenantId,
    displayName: args.displayName,
    countryCode: args.countryCode,
  });
  const data = res.data;
  if (!res.ok) {
    return {
      error: data.error || `create_instance failed [${res.status}]`,
    };
  }
  return data;
}
