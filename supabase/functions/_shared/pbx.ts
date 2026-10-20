// Generic PBX ("מרכזיה") integration helpers.
// Pure functions shared by make-pbx-call (outgoing webhook to the PBX) and
// pbx-webhook (incoming call events / recordings from the PBX).

export interface PbxExtension {
  user_id: string;
  extension: string;
  caller_number?: string;
}

export interface PbxSettings {
  name?: string;
  outbound_url?: string;
  outbound_method?: "POST" | "GET";
  outbound_format?: "json" | "form";
  outbound_auth_header?: string;
  outbound_auth_value?: string;
  param_caller?: string;
  param_destination?: string;
  param_extension?: string;
  param_call_id?: string;
  default_caller_number?: string;
  default_extension?: string;
  extensions?: PbxExtension[];
  inbound_secret?: string;
}

export interface OutboundCall {
  callerNumber: string | null;
  destinationNumber: string;
  extension: string | null;
  callId: string;
}

/** Digits-only local Israeli format (0XXXXXXXXX). */
export function normalizePhone(phone: unknown): string | null {
  if (phone === null || phone === undefined) return null;
  let digits = String(phone).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("972")) digits = "0" + digits.slice(3);
  else if (digits.length === 9 && !digits.startsWith("0"))
    digits = "0" + digits;
  return digits;
}

/** Last 9 digits, used to match phones stored in any format. */
export function phoneMatchKey(phone: unknown): string | null {
  const n = normalizePhone(phone);
  if (!n || n.length < 7) return null;
  return n.slice(-9);
}

/**
 * ILIKE pattern matching the key's digits in order, with any separators.
 * Leading zeros are dropped so "+972-3-…" still matches a "03…" key; callers
 * confirm candidates with phoneMatchKey.
 */
export function phoneLikePattern(key: string): string {
  const digits = key.replace(/\D/g, "").replace(/^0+/, "");
  return "%" + digits.split("").join("%");
}

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

/** Rejects non-http(s) URLs and obvious internal hosts. */
export function isAllowedOutboundUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal")
  )
    return false;
  // IPv6 literals: block loopback, unspecified, unique-local and link-local.
  if (host.includes(":")) {
    if (host === "::" || host === "::1") return false;
    if (/^(fc|fd|fe8|fe9|fea|feb)/.test(host)) return false;
    if (host.startsWith("::ffff:")) return false;
    return true;
  }
  const ipv4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    )
      return false;
  }
  return true;
}

const pick = (p: Record<string, unknown>, keys: string[]): string | null => {
  for (const k of keys) {
    const v = p[k];
    if (v !== undefined && v !== null && String(v).trim() !== "")
      return String(v).trim();
  }
  return null;
};

export type CallDirection = "inbound" | "outbound" | null;

export interface PbxEvent {
  callId: string | null;
  caller: string | null;
  called: string | null;
  extension: string | null;
  direction: CallDirection;
  leadPhone: string | null;
  status: string | null;
  duration: number | null;
  recordingUrl: string | null;
}

/** Maps the many field names PBXs use onto one event shape. */
export function parsePbxEvent(p: Record<string, unknown>): PbxEvent {
  const caller = pick(p, [
    "caller",
    "from",
    "caller_number",
    "callerid",
    "cli",
    "ani",
    "src",
  ]);
  const called = pick(p, [
    "called",
    "to",
    "destination",
    "called_number",
    "dnis",
    "did",
    "dst",
  ]);
  const rawDirection = (pick(p, ["direction", "call_direction", "type"]) || "")
    .toLowerCase()
    .trim();
  const direction: CallDirection = ["in", "inbound", "incoming"].includes(
    rawDirection,
  )
    ? "inbound"
    : ["out", "outbound", "outgoing"].includes(rawDirection)
      ? "outbound"
      : null;
  const durationRaw = pick(p, [
    "duration",
    "call_duration",
    "billsec",
    "recording_duration",
  ]);
  const duration =
    durationRaw !== null && /^\d+(\.\d+)?$/.test(durationRaw)
      ? Math.round(Number(durationRaw))
      : null;
  return {
    callId: pick(p, ["call_id", "callid", "uniqueid", "call_uuid", "uuid"]),
    caller,
    called,
    extension: pick(p, ["extension", "ext", "agent_extension"]),
    direction,
    leadPhone: pick(p, ["lead_phone", "customer_phone", "phone"]),
    status: pick(p, ["status", "call_status", "disposition"]),
    duration,
    recordingUrl: pick(p, [
      "recording_url",
      "recording",
      "record_url",
      "recordingfile",
    ]),
  };
}

/**
 * Phones to try, in order, when matching the call to a lead.
 * The customer is the caller on inbound calls and the called number on
 * outbound calls; without a direction the caller is tried first.
 */
export function leadPhoneCandidates(event: PbxEvent): string[] {
  const ordered = event.leadPhone
    ? [event.leadPhone]
    : event.direction === "outbound"
      ? [event.called, event.caller]
      : [event.caller, event.called];
  const keys: string[] = [];
  for (const phone of ordered) {
    const key = phoneMatchKey(phone);
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

const STATUSES = new Set([
  "initiated",
  "ringing",
  "in-progress",
  "completed",
  "failed",
  "no-answer",
  "busy",
  "cancelled",
]);

/** Maps a PBX status onto the call_logs status check values. */
export function mapCallStatus(raw: string | null): string {
  const s = (raw || "").toLowerCase().replace(/[_\s]+/g, "-");
  if (STATUSES.has(s)) return s;
  if (s.includes("no-answer") || s === "noanswer" || s.includes("missed"))
    return "no-answer";
  if (s.includes("busy")) return "busy";
  if (s.includes("fail") || s.includes("congestion")) return "failed";
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("ring")) return "ringing";
  if (s.includes("answer") || s.includes("complete") || s.includes("hangup"))
    return "completed";
  // Unknown or missing status: the PBX only reports finished calls here.
  return "completed";
}

/** Constant-time string comparison for the webhook secret. */
export function secretsMatch(expected: string, provided: string): boolean {
  if (!expected || expected.length !== provided.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++)
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  return diff === 0;
}
