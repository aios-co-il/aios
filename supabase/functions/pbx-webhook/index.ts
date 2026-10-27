// Public webhook for the tenant's generic PBX. Receives call events and call
// recordings (a URL or an uploaded file) and attaches them to the lead whose
// phone matches the call.
// URL: /functions/v1/pbx-webhook?tenant_id=<UUID>, secret in x-webhook-secret.
import { serviceClient } from "../_shared/agent-channel/store.ts";
import { timingSafeEqual } from "../_shared/security.ts";
import { loadPbxIntegration } from "../_shared/telephony/settings.ts";
import {
  internalError,
  json,
  preflight,
} from "../_shared/telephony/response.ts";
import type { PbxSettings } from "../_shared/telephony/types.ts";
import { WebhookError } from "./errors.ts";
import { parsePbxEvent } from "./event.ts";
import {
  findCallById,
  findDuplicateRecording,
  findOpenCall,
  findOwnerByPhone,
  type Owner,
} from "./match.ts";
import { storeRecordingFile, validateRecordingUrl } from "./recording.ts";
import {
  readSecret,
  readTenantId,
  readWebhookRequest,
  type WebhookRequest,
} from "./request.ts";
import { insertCall, updateCall } from "./save.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST" && req.method !== "GET")
    return json({ error: "Method not allowed" }, 405);
  try {
    return await handle(req);
  } catch (error) {
    if (error instanceof WebhookError)
      return json({ error: error.message }, error.status);
    return internalError("pbx-webhook", error);
  }
});

async function handle(req: Request): Promise<Response> {
  const request = await readWebhookRequest(req);
  const tenantId = readTenantId(request.params);
  const sb = serviceClient();
  const settings = await authorize(sb, tenantId, req, request);

  const event = parsePbxEvent(request.params);
  validateRecordingUrl(event.recordingUrl);
  const file = request.recordingFile?.size ? request.recordingFile : null;

  let existing = await findCallById(sb, tenantId, event.callId);
  const owner: Owner =
    existing?.lead_id || existing?.client_id
      ? { leadId: existing.lead_id, clientId: existing.client_id }
      : await findOwnerByPhone(sb, tenantId, event);

  // A retried recording is not stored again, but the event's status and
  // duration still update the call it belongs to.
  const duplicate =
    !!(event.recordingUrl || file) &&
    (existing?.recording_url || existing?.recording_path
      ? existing
      : await findDuplicateRecording(sb, tenantId, event, !!file));
  existing ??= duplicate || null;

  const recording = duplicate
    ? { url: null, path: null }
    : {
        url: event.recordingUrl,
        path: file ? await storeRecordingFile(sb, tenantId, file) : null,
      };
  const bringsRecording = !!(recording.url || recording.path);
  existing ??= await findOpenCall(sb, tenantId, owner, event, bringsRecording);

  const saved = existing
    ? await updateCall(
        sb,
        tenantId,
        existing,
        event,
        owner,
        recording,
        settings,
      )
    : await insertCall(sb, tenantId, settings, event, owner, recording);
  return json({
    ok: true,
    ...(duplicate && { duplicate: true }),
    call_log_id: saved.callLogId,
    lead_id: saved.leadId,
    client_id: saved.clientId,
    matched: !!(saved.leadId || saved.clientId),
  });
}

/** One 403 for a wrong secret and an unconfigured tenant, so callers cannot
 *  probe which tenants have a PBX. */
async function authorize(
  sb: ReturnType<typeof serviceClient>,
  tenantId: string,
  req: Request,
  request: WebhookRequest,
): Promise<PbxSettings> {
  const integration = await loadPbxIntegration(sb, tenantId);
  const secret = integration?.isActive
    ? integration.settings.inbound_secret
    : "";
  if (!secret || !timingSafeEqual(secret, readSecret(req, request.params)))
    throw new WebhookError("Invalid secret", 403);
  return integration!.settings;
}
