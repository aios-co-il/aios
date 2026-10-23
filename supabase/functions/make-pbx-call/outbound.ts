// Builds the outgoing webhook the CRM sends to the PBX to start a call.
import type { OutboundCall, PbxSettings } from "../_shared/telephony/types.ts";

/** Picks the extension and caller number for the user placing the call. */
export function resolveCaller(
  settings: PbxSettings,
  userId: string,
): { extension: string | null; callerNumber: string | null } {
  const mapped = (settings.extensions || []).find((e) => e.user_id === userId);
  return {
    extension:
      mapped?.extension?.trim() || settings.default_extension?.trim() || null,
    callerNumber:
      mapped?.caller_number?.trim() ||
      settings.default_caller_number?.trim() ||
      null,
  };
}

/** Builds the request the CRM sends to the PBX to start a call. */
export function buildOutboundRequest(
  settings: PbxSettings,
  call: OutboundCall,
): { url: string; init: RequestInit } {
  if (!settings.outbound_url) throw new Error("outbound_url is not set");
  const params: Record<string, string> = {};
  const set = (key: string | undefined, fallback: string, value: unknown) => {
    const name = (key || "").trim() || fallback;
    if (value !== null && value !== undefined && value !== "")
      params[name] = String(value);
  };
  set(settings.param_caller, "caller", call.callerNumber);
  set(settings.param_destination, "destination", call.destinationNumber);
  set(settings.param_extension, "extension", call.extension);
  set(settings.param_call_id, "call_id", call.callId);

  const headers: Record<string, string> = {};
  const authHeader = settings.outbound_auth_header?.trim();
  if (authHeader && settings.outbound_auth_value)
    headers[authHeader] = settings.outbound_auth_value;

  const method = settings.outbound_method === "GET" ? "GET" : "POST";
  const url = new URL(settings.outbound_url);
  if (method === "GET") {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return { url: url.toString(), init: { method, headers } };
  }
  if (settings.outbound_format === "form") {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    return {
      url: url.toString(),
      init: { method, headers, body: new URLSearchParams(params).toString() },
    };
  }
  headers["Content-Type"] = "application/json";
  return {
    url: url.toString(),
    init: { method, headers, body: JSON.stringify(params) },
  };
}
