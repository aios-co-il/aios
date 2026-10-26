// Pure helpers for recording automation runs in `automation_executions`.
// Kept free of Deno/Supabase imports so they can be unit-tested with node.

export type ExecutionStatus = "completed" | "failed";

export type ExecutionSummary = {
  status: ExecutionStatus;
  actions_count: number;
  error: string | null;
};

type SettledResult =
  | { status: "fulfilled"; value: unknown }
  | { status: "rejected"; reason: unknown };

function errorText(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Summarizes the per-automation results of one trigger call.
 * `actions_count` counts only automations that actually ran: skipped ones
 * (`skipped: true`, or conditions not met → `undefined`) are not counted.
 * A run is "failed" when any automation threw or reported `success: false`.
 */
export function summarizeExecution(results: SettledResult[]): ExecutionSummary {
  const errors: string[] = [];
  let ran = 0;
  for (const result of results) {
    if (result.status === "rejected") {
      ran++;
      errors.push(errorText(result.reason));
      continue;
    }
    const value = result.value as
      | { success?: boolean; skipped?: boolean; error?: unknown }
      | null
      | undefined;
    if (!value || value.skipped) continue;
    ran++;
    if (value.success === false) {
      errors.push(
        value.error ? errorText(value.error) : "automation reported failure",
      );
    }
  }
  return {
    status: errors.length > 0 ? "failed" : "completed",
    actions_count: ran,
    error: errors.length > 0 ? errors.join("; ").slice(0, 2000) : null,
  };
}

/** Postgres unique_violation: another invocation already claimed this message. */
export function isDuplicateClaimError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "23505"
  );
}

/**
 * A message claim is a lease: it is "done" once the message is stored
 * (`completed_at` set). An unfinished claim older than the lease belongs to an
 * invocation that died mid-way (timeout, redeploy), so a retry may take it over.
 */
export const MESSAGE_CLAIM_LEASE_MS = 5 * 60_000;

export function isClaimLeaseExpired(
  claim: { processed_at: string | null; completed_at: string | null },
  nowMs: number,
  leaseMs: number = MESSAGE_CLAIM_LEASE_MS,
): boolean {
  if (claim.completed_at) return false;
  if (!claim.processed_at) return true;
  const claimedAt = Date.parse(claim.processed_at);
  if (Number.isNaN(claimedAt)) return true;
  return nowMs - claimedAt >= leaseMs;
}

/** Last 9 digits: matches 05X…, 9725X… and WhatsApp wids (9725X…@c.us). */
export function phoneKey(value: string | null | undefined): string | null {
  const digits = String(value ?? "")
    .split("@")[0]
    .replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : null;
}

/**
 * True when the sender is one of the tenant's own connected WhatsApp numbers.
 * Such a message is our own output (or typed on our own phone) and is already
 * handled on the connection that sent it, so other connections must not
 * trigger automations from it. This is what makes automation loops impossible.
 */
export function isOwnConnectionSender(
  sender: string | null | undefined,
  ownNumbers: Iterable<string | null | undefined>,
): boolean {
  const senderKey = phoneKey(sender);
  if (!senderKey) return false;
  for (const own of ownNumbers) {
    if (phoneKey(own) === senderKey) return true;
  }
  return false;
}
