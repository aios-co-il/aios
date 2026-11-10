import type { SaveMediaFromChatArgs } from "./media-record-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing save_media_from_chat executor and side-effect order. */
export async function executeSaveMediaFromChat(
  args: SaveMediaFromChatArgs,
  context: ToolExecutionContext,
) {
  const { tenantId, userId, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = context;

  const r = await fetch(`${SUPABASE_URL}/functions/v1/carmen-save-media`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      apikey: SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({
      tenant_id: tenantId,
      created_by: userId,
      ...args,
    }),
  });
  const j = await r.json();
  if (!r.ok) {
    throw new Error(j?.error || "save_media_failed");
  }
  return j;
}
