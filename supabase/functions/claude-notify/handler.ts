/**
 * claude-notify lets Claude (running in a routine session) and Carmen's
 * pulse / health jobs push a 1:1 WhatsApp update to the human, independent of
 * Carmen's live session.
 *
 * - Auth fails closed (auth.ts).
 * - Recipient: explicit chat_id / campaign_pulse_phone / tenant campaigner
 *   (plan.ts).
 * - Transport: only a PRIMARY Carmen line; a Green API step only as a
 *   labelled green_fallback (transport.ts, send.ts).
 *
 * Body: { tenant_id, message, chat_id? }  → { sent, status, transport, error, … }
 *       { ping: true, tenant_id? }        → per tenant: step type it would use,
 *                                            line role, Manus integration status;
 *                                            sends nothing (ping.ts).
 */

import { corsHeaders } from "../_shared/cors.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import { authorizeNotifyRequest } from "./auth.ts";
import { pingTenants } from "./ping.ts";
import { planTenantNotify } from "./plan.ts";
import { sendNotify } from "./send.ts";

export type ClaudeNotifyDeps = {
  supabaseUrl: string;
  serviceRoleKey: string;
  bearerSecret?: string | null;
  createSupabase: () => Pick<DbClient, "from">;
  fetchImpl?: typeof fetch;
  logger?: Pick<Console, "warn" | "error">;
};

type NotifyBody = {
  ping: boolean;
  tenantId: string;
  message: string;
  chatId: string | null;
};

// claude-notify answers POST only, so its preflight advertises just POST.
const NOTIFY_CORS = {
  ...corsHeaders,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** The claude-notify request handler, with env, client and fetch injected. */
export function createClaudeNotifyHandler(deps: ClaudeNotifyDeps) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const logger = deps.logger ?? console;

  return async function handle(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: NOTIFY_CORS });
    }
    if (req.method !== "POST") {
      return json({ error: "POST only" }, 405);
    }
    const auth = authorizeNotifyRequest({
      authorization: req.headers.get("authorization"),
      bearerSecret: deps.bearerSecret,
      serviceRoleKey: deps.serviceRoleKey,
    });
    if (!auth.ok) {
      return json({ error: "unauthorized" }, 401);
    }
    const body = await readNotifyBody(req);
    if (!body) {
      return json({ error: "bad json" }, 400);
    }

    const sb = deps.createSupabase();
    try {
      if (body.ping) {
        const tenants = await pingTenants(sb, body.tenantId);
        return json({
          ok: true,
          ping: true,
          auth: auth.via,
          sent: false,
          tenants,
        });
      }
      if (!body.tenantId || !body.message) {
        return json({ error: "tenant_id and message are required" }, 400);
      }
      const plan = await planTenantNotify(sb, body.tenantId, body.chatId);
      return json(
        await sendNotify({ ...deps, fetchImpl, logger }, plan, body.message),
      );
    } catch (e) {
      logger.error(
        "[claude-notify] failed",
        e instanceof Error ? e.message : String(e),
      );
      return json(
        { ok: false, sent: false, status: "failed", error: "internal error" },
        500,
      );
    }
  };
}

/** The request body's fields, or null when the body is not JSON. */
async function readNotifyBody(req: Request): Promise<NotifyBody | null> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return null;
  }
  const body: Record<string, unknown> =
    raw && typeof raw === "object"
      ? Object.fromEntries(Object.entries(raw))
      : {};
  return {
    ping: body.ping === true,
    tenantId: String(body.tenant_id ?? "").trim(),
    message: String(body.message ?? "").trim(),
    chatId: body.chat_id ? String(body.chat_id).trim() : null,
  };
}

/** A JSON response with claude-notify's CORS headers. */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...NOTIFY_CORS, "Content-Type": "application/json" },
  });
}
