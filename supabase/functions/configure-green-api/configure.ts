// Points a Green API line's webhooks at green-api-webhook and gives the line a
// new random webhook token, which Green API then sends with every call
// (_shared/green-api-webhook-auth/token.ts). Called by the Green API settings
// page on save and by its "refresh webhook settings" button.
import { corsHeaders } from "../_shared/cors.ts";
import { tenantUserAccess } from "../_shared/auth/tenant-access.ts";
import { publicFunctionUrl } from "../_shared/public-api/url.ts";
import { requireAuth, timingSafeEqual } from "../_shared/security.ts";
import { serviceClient, type DbClient } from "../_shared/supabase-clients.ts";
import {
  findWebhookLine,
  type WebhookLine,
} from "../_shared/green-api-webhook-auth/line.ts";
import { saveGreenApiSettings } from "./green-settings.ts";

export type ConfigureDeps = {
  db: Pick<DbClient, "from" | "rpc">;
  authenticate: typeof requireAuth;
  fetch: typeof fetch;
  newToken(): string;
  webhookUrl(): string;
};

type ConfigureRequest = { instanceId: string; apiToken: string };

/**
 * Configures the line the caller names by instance id and API token: the
 * caller must be a signed-in member of the line's tenant (or a super admin)
 * and send the line's stored API token. The token is stored only after Green
 * API saved it; a line whose new token was not stored keeps working, its calls
 * logged as tokenless, until the next refresh.
 */
export async function configureGreenApi(
  req: Request,
  deps: ConfigureDeps = defaultDeps(),
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const caller = await deps.authenticate(req);
  if (caller?.kind !== "user" || !caller.userId) {
    return reply({ error: "Unauthorized" }, 401);
  }

  const body = await readRequest(req);
  if (!body) {
    return reply({ error: "Missing instanceId or apiToken" }, 400);
  }

  const line = await callerLine(deps.db, body, caller.userId);
  if (line === "lookup_failed") {
    return reply({ error: "Failed to configure Green API" }, 500);
  }
  if (!line) {
    return reply({ error: "Not allowed" }, 403);
  }

  const token = deps.newToken();
  const saved = await saveGreenApiSettings(deps, line, token);
  if (!saved) {
    return reply({ error: "Failed to configure Green API" }, 502);
  }

  const { error } = await deps.db.rpc("store_green_api_webhook_token", {
    p_integration_id: line.id,
    p_token: token,
  });
  if (error) {
    console.error("[configure-green-api] webhook token not stored", {
      integration_id: line.id,
      error: error.message,
    });
    return reply({ error: "Webhook token was not saved" }, 500);
  }

  return reply({
    success: true,
    message: "Webhook settings configured successfully",
  });
}

/** The service client, the caller check, the network and a 256-bit random token. */
function defaultDeps(): ConfigureDeps {
  return {
    db: serviceClient(),
    authenticate: requireAuth,
    fetch: (input, init) => fetch(input, init),
    newToken: randomToken,
    webhookUrl: () => publicFunctionUrl("green-api-webhook"),
  };
}

/** The request's instance id and API token, or null when either is missing. */
async function readRequest(req: Request): Promise<ConfigureRequest | null> {
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return null;
  }

  const instanceId = "instanceId" in body ? body.instanceId : null;
  const apiToken = "apiToken" in body ? body.apiToken : null;
  if (typeof apiToken !== "string" || !apiToken) {
    return null;
  }
  if (typeof instanceId === "number") {
    return { instanceId: `${instanceId}`, apiToken };
  }
  return typeof instanceId === "string" && instanceId
    ? { instanceId, apiToken }
    : null;
}

/**
 * The line green-api-webhook resolves for the instance, when the caller may
 * configure it: a member of its tenant or a super admin, holding its API token.
 * Every other case is null, so the reply does not say which line exists.
 */
async function callerLine(
  db: Pick<DbClient, "from" | "rpc">,
  body: ConfigureRequest,
  userId: string,
): Promise<WebhookLine | null | "lookup_failed"> {
  const { line, error } = await findWebhookLine(db, body.instanceId);
  if (error) {
    console.error("[configure-green-api] line lookup failed", error);
    return "lookup_failed";
  }
  if (!line?.api_key || !timingSafeEqual(body.apiToken, line.api_key)) {
    console.warn("[configure-green-api] refused: no line with this token", {
      user_id: userId,
    });
    return null;
  }

  try {
    const access = await tenantUserAccess(db, line.tenant_id, userId);
    if (access.member || access.superAdmin) {
      return line;
    }
  } catch (e) {
    console.error("[configure-green-api] access lookup failed", e);
    return "lookup_failed";
  }
  console.warn(
    "[configure-green-api] refused: not a member of the line's tenant",
    {
      user_id: userId,
      integration_id: line.id,
    },
  );
  return null;
}

/** A JSON reply with the CORS headers the browser needs. */
function reply(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders });
}

/** 32 random bytes as hex. */
function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
