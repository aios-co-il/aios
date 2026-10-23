import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { fetchCarmenAccessRow } from "./carmenAccessApi";
import { allowedRoutes } from "@/lib/carmenBrainAccess";
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

/** A channel call's outcome: HTTP status plus the function's JSON body. */
export type ChannelResponse = {
  ok: boolean;
  status: number;
  json: ChannelJson;
};

/** The fields callers read from agent-channel-send replies. */
export type ChannelJson = {
  error?: string;
  status?: ConversationChannelStatus;
  routes?: unknown;
  restricted?: boolean;
  [key: string]: unknown;
};

const asJson = (v: unknown): ChannelJson =>
  v && typeof v === "object" ? (v as ChannelJson) : {};

/** POSTs one action to the `agent-channel-send` edge function. */
export async function postChannel(
  body: Record<string, unknown>,
): Promise<ChannelResponse> {
  const { data, error } = await supabase.functions.invoke(
    "agent-channel-send",
    { body },
  );
  if (!error) return { ok: true, status: 200, json: asJson(data) };
  // Non-2xx: keep the status and error body the callers branch on.
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    return {
      ok: false,
      status: res.status,
      json: asJson(await res.json().catch(() => null)),
    };
  }
  throw error;
}

/** Lists the brains the user may use, applying "view as" permissions. */
export async function fetchBrainRoutes(
  tenantId: string,
  viewAsUserId: string | null | undefined,
): Promise<{ list: BrainRoute[]; restricted: boolean }> {
  // "View as": the server would answer for the signed-in admin, so preview
  // from the tenant's full route list and the viewed user's own row.
  if (viewAsUserId) return previewBrainRoutes(tenantId, viewAsUserId);
  const res = await postChannel({ action: "list_routes", tenant_id: tenantId });
  if (!res.ok) throw new Error(String(res.status));
  const routes = Array.isArray(res.json.routes)
    ? (res.json.routes as BrainRoute[])
    : [];
  const restricted = res.json.restricted === true;
  // A restricted user gets exactly the brains they may use, even none.
  if (!routes.length && !restricted)
    return { list: FALLBACK_BRAIN_ROUTES, restricted };
  return { list: routes, restricted };
}

/** The brains a viewed user would get, without asking the edge function. */
async function previewBrainRoutes(
  tenantId: string,
  userId: string,
): Promise<{ list: BrainRoute[]; restricted: boolean }> {
  const [{ data }, row] = await Promise.all([
    supabase
      .from("agent_brain_routes")
      .select("id,slug,label,route_type,provider,config,active")
      .eq("tenant_id", tenantId)
      .eq("active", true),
    fetchCarmenAccessRow(tenantId, userId),
  ]);
  const all = data?.length ? (data as BrainRoute[]) : FALLBACK_BRAIN_ROUTES;
  return { list: allowedRoutes(all, row), restricted: !!row };
}

/** Advisory channel health; null when unavailable. Throws on network/auth. */
export async function fetchChannelHealth(
  tenantId: string,
): Promise<ChannelHealth | null> {
  const res = await postChannel({
    action: "channel_health",
    tenant_id: tenantId,
  });
  if (!res.ok || typeof res.json.ok !== "boolean") return null;
  return res.json as unknown as ChannelHealth;
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
