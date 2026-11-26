import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { SendResult } from "../_shared/agent-channel/types.ts";

/**
 * Records the dispatch outcome on the stored user message. A retry with the
 * same idempotency key reads it back (`duplicateSendResult`). The outcome joins
 * what the send already stored (attachments, screen context), because the chat
 * rebuilds a reloaded conversation from this row.
 */
export async function recordDispatch(
  sb: Pick<SupabaseClient, "from">,
  args: {
    tenantId: string;
    idempotencyKey: string;
    storedMetadata: Record<string, unknown>;
    result: SendResult;
  },
): Promise<void> {
  const { error } = await sb
    .from("ai_conversation_messages")
    .update({
      metadata: { ...args.storedMetadata, dispatch: args.result },
    })
    .eq("tenant_id", args.tenantId)
    .eq("idempotency_key", args.idempotencyKey);

  if (error) {
    console.error(
      "[agent-channel-send] dispatch outcome not recorded:",
      error.message,
    );
  }
}
