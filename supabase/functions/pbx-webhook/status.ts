// Maps PBX call statuses onto call_logs status values.

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
