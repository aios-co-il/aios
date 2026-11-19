// "Continue only if the lead is still in the status that started the run"
// (AIO-611). trigger-automation stores the guard when a delay step pauses a run;
// automation-delay-worker checks it against the lead before resuming.

/** The lead and status a paused run must still match when its delay ends. */
export type LeadStatusGuard = {
  lead_id: string;
  column: "status" | "response_status";
  value: string;
};

/** The lead columns a guard compares against. */
export type LeadStatusRow = {
  status: string | null;
  response_status: string | null;
};

/** The parts of a lead status trigger payload a guard is built from. */
type StatusChangePayload = {
  lead_id?: unknown;
  new_status?: unknown;
  status_kind?: unknown;
};

/**
 * The guard for a run a lead status change started, or null when the payload
 * names no lead or no new status (the delay then resumes unconditionally).
 */
export function leadStatusGuard(
  payload: StatusChangePayload | null | undefined,
): LeadStatusGuard | null {
  const leadId = payload?.lead_id;
  const value = payload?.new_status;
  if (typeof leadId !== "string" || !leadId) {
    return null;
  }
  if (typeof value !== "string" || !value) {
    return null;
  }
  return {
    lead_id: leadId,
    column:
      payload?.status_kind === "response_status" ? "response_status" : "status",
    value,
  };
}

/** Reads a stored guard back, or null when the stored JSON is not a guard. */
export function parseLeadStatusGuard(stored: unknown): LeadStatusGuard | null {
  if (!stored || typeof stored !== "object") {
    return null;
  }
  const guard = stored as Record<string, unknown>;
  if (typeof guard.lead_id !== "string" || !guard.lead_id) {
    return null;
  }
  if (typeof guard.value !== "string" || !guard.value) {
    return null;
  }
  if (guard.column !== "status" && guard.column !== "response_status") {
    return null;
  }
  return { lead_id: guard.lead_id, column: guard.column, value: guard.value };
}

/** True when the lead exists and still holds the guarded status. */
export function leadStillInStatus(
  guard: LeadStatusGuard,
  lead: LeadStatusRow | null,
): boolean {
  return lead !== null && lead[guard.column] === guard.value;
}
