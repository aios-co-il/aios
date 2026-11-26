/**
 * Who may start or resume a run in run-ai-agent-v2 (AIO-661), asked before the
 * handler touches a table.
 *
 * A signed-in user starts a run only as themselves, in a tenant they belong to
 * and with that tenant's agent: the same rule as run-ai-agent (runTenantDenied).
 * Resuming is for service callers only. A run stops to wait for an approver, and
 * resume-agent-run checks the approver's tenant and role and claims the approval
 * before it calls here, so a user resuming directly would skip that gate even
 * on their own run.
 */
import type { Tables } from "../_shared/database.types.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import { asUuidOrNull } from "../_shared/uuid.ts";
import { bindRunAgentCaller } from "../run-ai-agent/caller-trust.ts";
import {
  runTenantDenied,
  type RunAuth,
} from "../run-ai-agent/run-tenant-access.ts";

/** The request may go on, or the refusal the handler sends back. */
export type RunRequestGate =
  { ok: true } | { ok: false; status: 401 | 403; error: string };

/**
 * Rows a new run points at. Only service callers name them (the supervisor's
 * parent run, a replay's source run); a user's would not be checked against
 * their tenant.
 */
const SERVICE_ONLY_RUN_LINKS = [
  "parent_run_id",
  "replay_of_run_id",
  "conversation_id",
] as const;

/**
 * Decides a start or resume request for the verified caller, reading nothing
 * for a caller it refuses outright. A user's body is bound to them in place:
 * their own user_id and no links to other rows.
 */
export async function authorizeRunRequest(
  sb: Pick<DbClient, "from" | "rpc">,
  auth: RunAuth | null,
  body: Record<string, unknown>,
): Promise<RunRequestGate> {
  if (!auth) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  if (auth.kind === "service") {
    return { ok: true };
  }
  if (body.run_id) {
    console.warn(`[run-ai-agent-v2] refused user ${auth.userId}: resume`);
    return {
      ok: false,
      status: 403,
      error: "Only an approved step resumes a run",
    };
  }

  const denied = await runTenantDenied(sb, auth, body);
  if (denied) {
    return { ok: false, status: 403, error: denied };
  }

  bindRunAgentCaller(body, auth);
  for (const link of SERVICE_ONLY_RUN_LINKS) {
    delete body[link];
  }
  return { ok: true };
}

/**
 * The run a service caller resumes, read inside the tenant the caller names;
 * null when that tenant has no such run.
 */
export async function resumableRun(
  sb: Pick<DbClient, "from">,
  body: Record<string, unknown>,
): Promise<Tables<"agent_runs"> | null> {
  const runId = asUuidOrNull(body.run_id);
  const tenantId = asUuidOrNull(body.tenant_id);
  if (!runId || !tenantId) {
    return null;
  }

  const { data, error } = await sb
    .from("agent_runs")
    .select("*")
    .eq("id", runId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) {
    throw new Error(`agent_runs lookup failed: ${error.message}`);
  }
  return data;
}
