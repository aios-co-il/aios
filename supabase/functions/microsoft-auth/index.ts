// Microsoft 365 / Outlook OAuth: connect, status and disconnect for the
// signed-in user (AIO-322). Tokens live in microsoft_tokens, which only the
// service role reads.
import { corsHeaders } from "../_shared/cors.ts";
import { tenantUserAccess } from "../_shared/auth/tenant-access.ts";
import {
  type DbClient,
  serviceClient,
  userClient,
} from "../_shared/supabase-clients.ts";
import { handleCallback } from "./callback.ts";
import { buildAuthorizeUrl, microsoftOAuthConfig } from "./graph-oauth.ts";
import { signState } from "./oauth-state.ts";
import type { MicrosoftConnectionStatus } from "./types.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const url = new URL(req.url);
  if (req.method === "GET") {
    return await handleCallback(url);
  }
  try {
    return await handleAction(req);
  } catch (error) {
    console.error("microsoft-auth action failed:", error);
    return json({ error: "Microsoft connection request failed" }, 500);
  }
});

/** Runs an authenticated action: init (consent URL), status or disconnect. */
async function handleAction(req: Request): Promise<Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Unauthorized" }, 401);
  }
  const caller = userClient(authHeader);
  const {
    data: { user },
    error: userError,
  } = await caller.auth.getUser();
  if (userError || !user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const body = await req.json().catch(() => ({}));
  switch (body.action) {
    case "init":
      return await initConnection(user.id, body.tenantId);
    case "status":
      return await connectionStatus(caller);
    case "disconnect":
      return await disconnect(user.id);
    default:
      return json({ error: "Invalid action" }, 400);
  }
}

/** Returns the Microsoft consent URL, after checking the caller belongs to the tenant. */
async function initConnection(
  userId: string,
  tenantId: unknown,
): Promise<Response> {
  if (typeof tenantId !== "string") {
    return json({ error: "Missing tenantId" }, 400);
  }
  const access = await tenantUserAccess(serviceClient(), tenantId, userId);
  if (!access.member && !access.superAdmin) {
    return json({ error: "Forbidden" }, 403);
  }
  const config = microsoftOAuthConfig();
  const state = await signState(config.clientSecret, userId, tenantId);
  return json({ authUrl: buildAuthorizeUrl(config, state) });
}

/** The caller's connected Microsoft address and account type; never the tokens. */
async function connectionStatus(caller: DbClient): Promise<Response> {
  const { data, error } = await caller
    .rpc("get_user_microsoft_connection")
    .maybeSingle();
  if (error) {
    throw error;
  }
  const status: MicrosoftConnectionStatus = {
    connected: !!data,
    microsoft_email: data?.microsoft_email ?? null,
    account_type: accountType(data?.account_type),
    needs_reconnect: data?.needs_reconnect ?? false,
  };
  return json(status);
}

/** The stored account type, narrowed to the values the table allows. */
function accountType(value: string | undefined) {
  return value === "work" || value === "personal" ? value : null;
}

/** Deletes the caller's Microsoft tokens. */
async function disconnect(userId: string): Promise<Response> {
  const { error } = await serviceClient()
    .from("microsoft_tokens")
    .delete()
    .eq("user_id", userId);
  if (error) {
    throw error;
  }
  return json({ success: true });
}

/** A JSON response with CORS headers. */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
