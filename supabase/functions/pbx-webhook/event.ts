// Reads an incoming PBX webhook into one event shape.
import { phoneMatchKey } from "../_shared/telephony/phone.ts";
import type { CallDirection, PbxEvent } from "../_shared/telephony/types.ts";

const pick = (p: Record<string, unknown>, keys: string[]): string | null => {
  for (const k of keys) {
    const v = p[k];
    if (v !== undefined && v !== null && String(v).trim() !== "")
      return String(v).trim();
  }
  return null;
};

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
