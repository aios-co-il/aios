import type { Json, Tables } from "../_shared/database.types.ts";
import type { PulseTargetDb } from "../_shared/carmen/pulse-targets/context.ts";
import { parseTargetInput } from "../_shared/carmen/pulse-targets/parse-target-input.ts";
import { writeTargetToTables } from "../_shared/carmen/pulse-targets/write-target-tables.ts";
import { isJsonObject } from "../_shared/pulse/json.ts";
import { PULSE_PLATFORM_INTEGRATION_TYPES } from "../_shared/pulse/platforms.ts";
import { pulseTargetKindLabel } from "../_shared/pulse/targets/kinds.ts";

/** The fields of an agent_approval_queue row the pulse-target step reads. */
type ApprovalRow = Pick<
  Tables<"agent_approval_queue">,
  "tenant_id" | "requested_by" | "tool_input" | "expires_at" | "approved_at"
>;

/**
 * Runs an approved set_pulse_target row: an expired row is marked expired (410);
 * otherwise the target is written and the row records executed or failed.
 */
export async function handlePulseTargetApproval(
  db: PulseTargetDb,
  row: ApprovalRow,
  approvalId: string,
  approvedBy: string | null,
  headers: Record<string, string>,
  now: () => Date = () => new Date(),
): Promise<Response> {
  const respond = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), { status, headers });
  if (row.expires_at && new Date(row.expires_at).getTime() < now().getTime()) {
    const { error } = await db
      .from("agent_approval_queue")
      .update({ status: "expired" })
      .eq("id", approvalId)
      .eq("tenant_id", row.tenant_id)
      .in("status", ["pending", "approved"]);
    if (error) {
      return statusNotSaved(respond, approvalId, error);
    }
    return respond({ error: "expired", approval_id: approvalId }, 410);
  }
  const outcome = await applyApprovedPulseTarget(db, row, approvedBy, now);
  const { error } = await db
    .from("agent_approval_queue")
    .update({
      status: outcome.ok ? "executed" : "failed",
      approved_by: approvedBy || row.requested_by,
      approved_at: row.approved_at || now().toISOString(),
      executed_at: now().toISOString(),
      execution_result: outcome.result,
    })
    .eq("id", approvalId)
    .eq("tenant_id", row.tenant_id);
  if (error) {
    return statusNotSaved(respond, approvalId, error);
  }
  return respond(
    { success: outcome.ok, result: outcome.result, approval_id: approvalId },
    outcome.ok ? 200 : 400,
  );
}

/**
 * Writes the approved target to the tables named in the request, and only those
 * that still belong to the client in the row's tenant: to all of them or to none
 * (writeTargetToTables). A table that fails or takes no write fails the request,
 * naming any table whose restore failed too and so keeps the new target.
 */
export async function applyApprovedPulseTarget(
  db: PulseTargetDb,
  row: ApprovalRow,
  approvedBy: string | null,
  now: () => Date = () => new Date(),
): Promise<{ ok: boolean; result: { [key: string]: Json | undefined } }> {
  const input = isJsonObject(row.tool_input) ? row.tool_input : {};
  const parsed = parseTargetInput(input);
  if ("error" in parsed) {
    return { ok: false, result: parsed };
  }
  const tableIds = Array.isArray(input.table_ids)
    ? input.table_ids.map(String).filter(Boolean)
    : [];
  if (!tableIds.length) {
    return { ok: false, result: { error: "table_ids missing" } };
  }
  const { data: tables, error } = await db
    .from("crm_tables")
    .select("id, client_id, integration_type, integration_settings")
    .in("id", tableIds)
    .eq("client_id", parsed.clientId)
    .eq("tenant_id", row.tenant_id)
    .in("integration_type", [
      ...PULSE_PLATFORM_INTEGRATION_TYPES[parsed.platform],
    ]);
  if (error) {
    // The row stores the result and the response returns it: keep the cause in the log.
    console.error("carmen-approval-execute: set_pulse_target tables not read", {
      error: error.message,
    });
    return { ok: false, result: { error: "campaign tables not read" } };
  }
  if (!tables?.length) {
    return { ok: false, result: { error: "no matching campaign table" } };
  }
  const written = await writeTargetToTables(db, {
    tables,
    tenantIds: [row.tenant_id],
    patch: {
      goal: parsed.goal,
      kind: parsed.kind,
      value: parsed.value,
      source: "approved",
      campaignId: parsed.campaignId,
      campaignName:
        typeof input.campaign_name === "string" ? input.campaign_name : null,
      setBy: row.requested_by ?? null,
      approvedBy,
      setAt: now().toISOString(),
    },
  });
  if (!written.ok) {
    return {
      ok: false,
      result: { error: written.error, still_written: written.stillWritten },
    };
  }
  return {
    ok: true,
    result: {
      source: "approved",
      target: `${pulseTargetKindLabel(parsed.kind)} ${parsed.value}`,
      client_id: parsed.clientId,
      platform: parsed.platform,
      goal: parsed.goal,
      campaign_id: parsed.campaignId,
      tables: tables.map((table) => table.id),
    },
  };
}

/** A status write that failed: logged, and reported as a server error. */
function statusNotSaved(
  respond: (body: unknown, status: number) => Response,
  approvalId: string,
  error: { message: string },
): Response {
  console.error("carmen-approval-execute: set_pulse_target status not saved", {
    approval_id: approvalId,
    error: error.message,
  });
  return respond({ error: "status_not_saved", approval_id: approvalId }, 500);
}
