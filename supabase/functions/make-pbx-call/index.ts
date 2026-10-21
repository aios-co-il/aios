// Starts a call through the tenant's generic PBX: logs the call, then sends the
// PBX's outgoing webhook with caller number, destination number and extension.
import {
  serviceClient,
  userHasTenantAccess,
} from "../_shared/agent-channel/store.ts";
import { json, preflight } from "../_shared/pbx/http.ts";
import { resolveCaller } from "../_shared/pbx/outbound.ts";
import { loadPbxIntegration } from "../_shared/pbx/settings.ts";
import { isAllowedOutboundUrl } from "../_shared/pbx/url-guard.ts";
import { getAuthedUserId } from "./auth.ts";
import { createCallLog, markCallFailed } from "./call-log.ts";
import { sendDialRequest } from "./dial.ts";

async function handle(req: Request): Promise<Response> {
  const userId = await getAuthedUserId(req);
  if (!userId) return json({ error: "Unauthorized" }, 401);

  const { to_number, lead_id, client_id, tenant_id } = await req.json();
  if (!to_number || !tenant_id)
    return json(
      { error: "Missing required fields: to_number, tenant_id" },
      400,
    );

  const sb = serviceClient();
  if (!(await userHasTenantAccess(sb, userId, tenant_id)))
    return json({ error: "Forbidden" }, 403);

  const integration = await loadPbxIntegration(sb, tenant_id);
  const settings = integration?.settings;
  if (!integration?.isActive || !settings?.outbound_url)
    return json(
      {
        error: "PBX not configured",
        message: "יש להגדיר את המרכזיה ואת כתובת ה-Webhook היוצא",
      },
      422,
    );
  if (!isAllowedOutboundUrl(settings.outbound_url))
    return json({ error: "PBX outbound URL is not allowed" }, 422);

  const { extension, callerNumber } = resolveCaller(settings, userId);
  const callId = crypto.randomUUID();
  const callLog = await createCallLog(sb, {
    tenantId: tenant_id,
    userId,
    leadId: lead_id || null,
    clientId: client_id || null,
    toNumber: to_number,
    callerNumber,
    extension,
    callId,
  });

  const result = await sendDialRequest(settings, {
    callerNumber,
    destinationNumber: to_number,
    extension,
    callId,
  });
  if (!result.ok) {
    await markCallFailed(sb, callLog, result.detail);
    return json(
      {
        error: "PBX request failed",
        message: "המרכזיה לא קיבלה את בקשת החיוג",
        detail: result.detail,
        call_log: { ...callLog, status: "failed" },
      },
      502,
    );
  }
  return json({ success: true, call_log: callLog, call_id: callId });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  try {
    return await handle(req);
  } catch (error) {
    console.error("make-pbx-call error:", error);
    return json({ error: (error as Error).message }, 500);
  }
});
