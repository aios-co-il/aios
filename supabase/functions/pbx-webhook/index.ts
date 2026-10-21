// Public webhook for the tenant's generic PBX. Receives call events and call
// recordings (a URL or an uploaded file) and attaches them to the lead whose
// phone matches the call.
// URL: /functions/v1/pbx-webhook?tenant_id=<UUID>&secret=<SECRET>
import { serviceClient } from "../_shared/agent-channel/store.ts";
import { parsePbxEvent } from "../_shared/pbx/event.ts";
import { json, preflight } from "../_shared/pbx/http.ts";
import { secretsMatch } from "../_shared/pbx/secret.ts";
import { loadPbxIntegration } from "../_shared/pbx/settings.ts";
import { WebhookError } from "./errors.ts";
import {
  findCallAwaitingRecording,
  findCallById,
  findOwnerByPhone,
} from "./match.ts";
import { resolveRecordingUrl } from "./recording.ts";
import { readSecret, readTenantId, readWebhookRequest } from "./request.ts";
import { insertCall, updateCall } from "./save.ts";

async function handle(req: Request): Promise<Response> {
  const { params, recordingFile } = await readWebhookRequest(req);
  const tenantId = readTenantId(params);

  const sb = serviceClient();
  const integration = await loadPbxIntegration(sb, tenantId);
  const secret = integration?.settings.inbound_secret;
  if (!integration?.isActive || !secret)
    return json({ error: "PBX not configured for tenant" }, 404);
  if (!secretsMatch(secret, readSecret(req, params)))
    return json({ error: "Invalid secret" }, 403);

  const event = parsePbxEvent(params);
  const recordingUrl = await resolveRecordingUrl(
    sb,
    tenantId,
    event.recordingUrl,
    recordingFile,
  );

  // 1) The call this event belongs to, 2) whose phone it is,
  // 3) else the owner's latest call still waiting for its recording.
  let existing = await findCallById(sb, tenantId, event.callId);
  const owner =
    existing?.lead_id || existing?.client_id
      ? {
          leadId: existing.lead_id ?? null,
          clientId: existing.client_id ?? null,
        }
      : await findOwnerByPhone(sb, tenantId, event);
  if (!existing && recordingUrl)
    existing = await findCallAwaitingRecording(sb, tenantId, owner);

  const saved = existing
    ? await updateCall(sb, existing, event, owner, recordingUrl)
    : await insertCall(
        sb,
        tenantId,
        integration.settings,
        event,
        owner,
        recordingUrl,
      );
  return json({
    ok: true,
    call_log_id: saved.callLogId,
    lead_id: saved.leadId,
    client_id: saved.clientId,
    matched: !!(owner.leadId || owner.clientId),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST" && req.method !== "GET")
    return json({ error: "Method not allowed" }, 405);
  try {
    return await handle(req);
  } catch (error) {
    if (error instanceof WebhookError)
      return json({ error: error.message }, error.status);
    console.error("pbx-webhook error:", error);
    return json({ error: (error as Error).message }, 500);
  }
});
