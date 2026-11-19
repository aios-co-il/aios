// Moves a lead to the status a "change status" step sets and reports the exact
// transition, for the status-change fan-out (AIO-611).
import type { DbClient } from "../_shared/supabase-clients.ts";
import {
  type LeadStatusChange,
  leadStatusChange,
  type StatusStepConfig,
} from "./status-fanout.ts";

/** How often the move is tried when another writer changes the lead in between. */
const MAX_ATTEMPTS = 3;

/**
 * Sets the step's status on a lead of the run's org and returns the change it
 * made, or null when it made none (the lead already had the status, or the org
 * has no such lead). The update only matches the status that was just read, so
 * the returned old and new values are the transition this step performed, even
 * when someone else changes the lead at the same moment.
 */
export async function moveLeadStatus(
  supabase: DbClient,
  tenantId: string,
  leadId: string,
  config: StatusStepConfig,
): Promise<LeadStatusChange | null> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const before = await supabase
      .from("leads")
      .select("status, response_status")
      .eq("tenant_id", tenantId)
      .eq("id", leadId)
      .maybeSingle();
    if (before.error) {
      throw before.error;
    }
    const change = before.data
      ? leadStatusChange(config, leadId, before.data)
      : null;
    if (!change) {
      return null;
    }

    const column =
      change.kind === "response_status" ? "response_status" : "status";
    const update = supabase
      .from("leads")
      .update({ [column]: change.newStatus })
      .eq("tenant_id", tenantId)
      .eq("id", leadId);
    const moved = await (
      change.oldStatus === null
        ? update.is(column, null)
        : update.eq(column, change.oldStatus)
    )
      .select("id")
      .maybeSingle();
    if (moved.error) {
      throw moved.error;
    }
    if (moved.data) {
      return change;
    }
  }
  throw new Error(
    `lead ${leadId} changed status ${MAX_ATTEMPTS} times while this step was setting it`,
  );
}
