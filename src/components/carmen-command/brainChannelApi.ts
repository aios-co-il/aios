import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { fetchCarmenAccessRow } from "./carmenAccessApi";
import { allowedRoutes } from "../../../supabase/functions/_shared/carmen-brain-access";
import {
  FALLBACK_BRAIN_ROUTES,
  type BrainRoute,
  type ChannelHealth,
  type ConversationChannelStatus,
} from "@/lib/agentChannelRouting";
import type { SystemFixContextMetadata } from "@/lib/systemFixContext";

export type ChannelSendResult = {
  ok: boolean;
  kind: string;
  conversation_id: string;
  session_id?: string;
  run_id?: string;
  status: ConversationChannelStatus;
  stream: boolean;
  accepted_message: string;
  external_url?: string | null;
  duplicate?: boolean;
  error?: string;
  inline_reply?: string;
};

export type ChannelResponse = {
  ok: boolean;
  status: number;
  // The edge function's JSON body (or {} when it had none).
  json: any;
};

/** POSTs one action to the `agent-channel-send` edge function. */
export async function postChannel(
  body: Record<string, unknown>,
): Promise<ChannelResponse> {
  const { data, error } = await supabase.functions.invoke(
    "agent-channel-send",
    { body },
  );
  if (!error) return { ok: true, status: 200, json: data ?? {} };
  // Non-2xx: keep the status and error body the callers branch on.
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    return {
      ok: false,
      status: res.status,
      json: await res.json().catch(() => ({})),
    };
  }
  throw error;
}

/** Lists the brains the user may use, applying "view as" permissions. */
export async function fetchBrainRoutes(
  tenantId: string,
  viewAsUserId: string | null | undefined,
): Promise<{ list: BrainRoute[]; restricted: boolean }> {
  const res = await postChannel({ action: "list_routes", tenant_id: tenantId });
  if (!res.ok) throw new Error(String(res.status));
  const json = res.json;
  // A restricted user gets exactly the brains they may use, even none.
  let list =
    Array.isArray(json.routes) && (json.routes.length || json.restricted)
      ? (json.routes as BrainRoute[])
      : FALLBACK_BRAIN_ROUTES;
  let restricted = !!json.restricted;
  // "View as": the server answers for the signed-in admin, so apply the
  // viewed user's permissions here to preview what they would see.
  if (viewAsUserId) {
    const viewedRow = await fetchCarmenAccessRow(tenantId, viewAsUserId);
    if (viewedRow) {
      list = allowedRoutes(list, viewedRow);
      restricted = true;
    }
  }
  return { list, restricted };
}

/** Advisory channel health; null when unavailable. Throws on network/auth. */
export async function fetchChannelHealth(
  tenantId: string,
): Promise<ChannelHealth | null> {
  const res = await postChannel({
    action: "channel_health",
    tenant_id: tenantId,
  });
  if (!res.ok) return null;
  const json = res.json;
  if (json && typeof json.ok === "boolean") return json as ChannelHealth;
  return null;
}

export type ChannelSendArgs = {
  content: string;
  conversationId: string | null;
  inputMode: string;
  history: Array<{ role: string; content: string }>;
  idempotencyKey: string;
  route?: BrainRoute;
  contextMetadata?: SystemFixContextMetadata | null;
  attachments?: Array<{
    name: string;
    url: string;
    type: "image" | "file";
    size?: number;
    path?: string;
  }>;
};
