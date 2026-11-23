import { invokeExecutorFunction } from "./invoke-executor-function.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

type SaveMediaFromChatArgs = {
  message_id?: string;
  media_url?: string;
  mime_type?: string;
  client_id?: string;
  lead_id?: string;
  caption?: string;
  tags?: Array<string>;
};

/** Preserves the existing save_media_from_chat executor and side-effect order. */
export async function executeSaveMediaFromChat(
  args: SaveMediaFromChatArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, userId } = context;
  const result = await invokeExecutorFunction(supabase, "carmen-save-media", {
    ...args,
    tenant_id: tenantId,
    created_by: userId,
  });
  if (!result.ok) {
    throw new Error(result.data?.error || "save_media_failed");
  }
  return result.data;
}
