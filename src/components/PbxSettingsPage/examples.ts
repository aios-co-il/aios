import type { PbxSettingsData } from "./types";

/** The request the CRM will send to the PBX, as shown on the settings page. */
export function buildOutboundExample(form: PbxSettingsData): string {
  const params = {
    [form.param_caller || "caller"]: form.default_caller_number || "035551234",
    [form.param_destination || "destination"]: "0501234567",
    [form.param_extension || "extension"]: form.default_extension || "101",
    [form.param_call_id || "call_id"]: "8f1c2e4a-...-uuid",
  };
  const contentType =
    form.outbound_method === "GET"
      ? null
      : form.outbound_format === "form"
        ? "Content-Type: application/x-www-form-urlencoded"
        : "Content-Type: application/json";
  const auth = form.outbound_auth_header
    ? `${form.outbound_auth_header}: ••••••`
    : null;
  const headers = [contentType, auth].filter(Boolean).join("\n");
  const target = form.outbound_url || "https://your-pbx.example.com/dial";
  if (form.outbound_method === "GET") {
    const qs = new URLSearchParams(params).toString();
    return `GET ${target}${target.includes("?") ? "&" : "?"}${qs}\n${headers}`;
  }
  const body =
    form.outbound_format === "form"
      ? new URLSearchParams(params).toString()
      : JSON.stringify(params, null, 2);
  return `POST ${target}\n${headers}\n\n${body}`;
}

export function buildInboundExamples(url: string, secret: string) {
  return {
    json: `curl -X POST "${url}" \\
  -H "Content-Type: application/json" \\
  -H "x-webhook-secret: ${secret}" \\
  -d '{
    "call_id": "8f1c2e4a-...-uuid",
    "caller": "0501234567",
    "called": "035551234",
    "extension": "101",
    "direction": "inbound",
    "status": "answered",
    "duration": 125,
    "recording_url": "https://your-pbx.example.com/recordings/abc.mp3"
  }'`,
    file: `curl -X POST "${url}" \\
  -H "x-webhook-secret: ${secret}" \\
  -F "caller=0501234567" \\
  -F "called=035551234" \\
  -F "extension=101" \\
  -F "duration=125" \\
  -F "recording_file=@/path/to/call.mp3"`,
    response: `{
  "ok": true,
  "call_log_id": "…",
  "lead_id": "…",      // הליד ששויך (null אם לא נמצא)
  "client_id": null,
  "matched": true
}`,
  };
}

/** Fields the incoming webhook accepts, for the docs table. */
export const INBOUND_FIELDS = [
  [
    "caller",
    "from, cli, callerid, ani, src",
    "מספר המתקשר — לפיו מזוהה הליד בשיחה נכנסת",
  ],
  ["called", "to, destination, did, dnis, dst", "המספר אליו התקשרו"],
  ["extension", "ext, agent_extension", "שלוחת הנציג — משייכת את השיחה לנציג"],
  ["recording_url", "recording, record_url", "קישור http(s) להקלטה"],
  [
    "recording_file",
    "file, audio",
    "קובץ אודיו (multipart, עד 50MB) — במקום קישור",
  ],
  [
    "call_id",
    "callid, uniqueid, call_uuid",
    "מזהה השיחה. אותו מזהה שנשלח ב-Webhook היוצא מעדכן את אותה שיחה",
  ],
  [
    "direction",
    "inbound / outbound",
    "כיוון השיחה. ביוצאת, הליד מזוהה לפי המספר אליו התקשרו",
  ],
  [
    "lead_phone",
    "customer_phone, phone",
    "אופציונלי: טלפון הלקוח במפורש (גובר על הכיוון)",
  ],
  [
    "status",
    "call_status, disposition",
    "answered / no-answer / busy / failed",
  ],
  ["duration", "call_duration, billsec", "משך השיחה בשניות"],
] as const;
