import type { DbClient } from "../../_shared/supabase-clients.ts";
import { resolveChatScope } from "./resolve.ts";
import { chatReadRefusal } from "./responses.ts";
import type { ChatScope, ChatScopeInput } from "./types.ts";

/** What a chat reader needs besides its tool arguments. */
export interface ChatReadContext {
  supabase: Pick<DbClient, "from" | "rpc">;
  /** The verified caller and the WhatsApp chat of this turn, never tool args. */
  scopeInput: ChatScopeInput;
}

/**
 * The first step of every chat reader: the caller's chat scope, and the
 * refusal to return instead of reading (a "none" scope, or a contact outside a
 * staff scope). refusal is null to go ahead.
 */
export async function scopedChatRead(
  ctx: ChatReadContext,
  contact: { type: unknown; id: unknown } | null,
): Promise<{ scope: ChatScope; refusal: Record<string, unknown> | null }> {
  const scope = await resolveChatScope(ctx.supabase, ctx.scopeInput);
  const refusal = await chatReadRefusal(
    ctx.supabase,
    scope,
    contact,
    ctx.scopeInput.accessibleTenantIds,
  );
  return { scope, refusal };
}
