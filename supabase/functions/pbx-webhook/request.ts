// Reads PBX webhook parameters from the query string and any body format.
import { WebhookError } from "./errors.ts";

const FILE_FIELDS = ["recording_file", "recording", "file", "audio"];

export interface WebhookRequest {
  params: Record<string, unknown>;
  recordingFile: File | null;
}

async function readBody(req: Request): Promise<WebhookRequest> {
  const params: Record<string, unknown> = {};
  let recordingFile: File | null = null;
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    Object.assign(params, await req.json());
  } else if (ct.includes("form")) {
    const fd = await req.formData();
    for (const [k, v] of fd.entries()) {
      if (typeof v === "string") params[k] = v;
      else if (!recordingFile && FILE_FIELDS.includes(k)) recordingFile = v;
    }
  } else {
    const text = await req.text();
    if (text.trim().startsWith("{")) Object.assign(params, JSON.parse(text));
    else if (text.includes("="))
      new URLSearchParams(text).forEach((v, k) => (params[k] = v));
  }
  return { params, recordingFile };
}

export async function readWebhookRequest(
  req: Request,
): Promise<WebhookRequest> {
  let parsed: WebhookRequest = { params: {}, recordingFile: null };
  if (req.method === "POST") {
    try {
      parsed = await readBody(req);
    } catch {
      throw new WebhookError("Could not parse request body", 400);
    }
  }
  // Query string wins so tenant_id / secret in the URL cannot be overridden.
  new URL(req.url).searchParams.forEach((v, k) => (parsed.params[k] = v));
  return parsed;
}

export function readTenantId(params: Record<string, unknown>): string {
  const tenantId = String(params.tenant_id || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(tenantId))
    throw new WebhookError("tenant_id required", 400);
  return tenantId;
}

export function readSecret(
  req: Request,
  params: Record<string, unknown>,
): string {
  return req.headers.get("x-webhook-secret") || String(params.secret || "");
}
