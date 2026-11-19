// A flow's "change status" step can start the lead_status_changed automations
// for the lead it changed (AIO-611). Only the app fired that trigger before, so
// a status a flow set never reached the automations waiting for it.
import { buildLeadStatusChangedData } from "../_shared/automation-status.ts";

/** The part of a "change status" step's settings the fan-out reads. */
export type StatusStepConfig = {
  entity?: unknown;
  status?: unknown;
  status_field?: unknown;
  fire_status_triggers?: unknown;
};

/** A lead's two status columns. */
export type LeadStatuses = {
  status: string | null;
  response_status: string | null;
};

/** The lead status change a step made, as the trigger payload names it. */
export type LeadStatusChange = {
  leadId: string;
  kind: "response_status" | "pipeline_stage";
  oldStatus: string | null;
  newStatus: string;
};

/** True when the step is set to start status-change automations for a lead. */
export function firesStatusTriggers(config: StatusStepConfig): boolean {
  const onLead = !config.entity || config.entity === "lead";
  return config.fire_status_triggers === true && onLead;
}

/**
 * The change a step made to a lead, or null when it changed nothing: no status
 * configured, or the lead already had it.
 */
export function leadStatusChange(
  config: StatusStepConfig,
  leadId: string,
  before: LeadStatuses,
): LeadStatusChange | null {
  const newStatus = config.status;
  if (typeof newStatus !== "string" || !newStatus) {
    return null;
  }
  const kind =
    config.status_field === "response_status"
      ? "response_status"
      : "pipeline_stage";
  const oldStatus =
    kind === "response_status" ? before.response_status : before.status;
  return oldStatus === newStatus
    ? null
    : { leadId, kind, oldStatus, newStatus };
}

/**
 * The step's settings without the status: what is left for the plain update
 * once the status itself was moved, so that update cannot write the status a
 * second time over someone else's change.
 */
export function withoutStatus<Config extends StatusStepConfig>(
  config: Config,
): Config {
  return { ...config, status: undefined };
}

/** The fields of a trigger-automation request the loop guard reads. */
type LoopKeyRequest = {
  trigger_type?: unknown;
  automationId?: unknown;
  data?: { new_status?: unknown } | null;
};

/**
 * The key a run adds to the execution chain. A status-change run includes the
 * status it moved to, so a flow that moves a lead on to another status is not
 * mistaken for a loop, while a move back to a status already in the chain is.
 */
export function automationLoopKey(
  request: LoopKeyRequest,
  entityKey: string,
): string {
  const base = `${request.trigger_type || request.automationId}:${entityKey}`;
  const newStatus = request.data?.new_status;
  return typeof newStatus === "string" && newStatus
    ? `${base}:${newStatus}`
    : base;
}

/** Where a fan-out happens in the automation chain. */
export type FanoutContext = {
  tenantId: string;
  depth: number;
  chain: Array<string>;
};

/** The trigger-automation request that fires lead_status_changed for a change. */
export function leadStatusChangedRequest(
  change: LeadStatusChange,
  context: FanoutContext,
) {
  return {
    trigger_type: "lead_status_changed",
    tenant_id: context.tenantId,
    data: buildLeadStatusChangedData({
      id: change.leadId,
      kind: change.kind,
      newStatus: change.newStatus,
      oldStatus: change.oldStatus,
      tenant_id: context.tenantId,
    }),
    _execution_depth: context.depth + 1,
    _execution_chain: context.chain,
  };
}

/** One entry of trigger-automation's `results`: null when an automation's conditions did not match. */
type AutomationResult = {
  success?: boolean;
  skipped?: boolean;
  error?: unknown;
} | null;

/** What the fan-out reports in the step's response. */
export type FanoutResult = { fired: true; automations_run: number };

/**
 * Reads trigger-automation's results: how many automations ran, or throws when
 * one failed. An entry that only carries `error` is a rejected run and counts
 * as failed.
 */
export function fanoutResult(
  results: Array<AutomationResult> | undefined,
): FanoutResult {
  const entries = (results || []).filter((result) => result !== null);
  const failed = entries.filter(
    (result) => result.success === false || result.error !== undefined,
  );
  if (failed.length > 0) {
    const reasons = failed.map((result) =>
      typeof result.error === "string" && result.error
        ? result.error
        : "unknown error",
    );
    throw new Error(`status-change automations failed: ${reasons.join(" | ")}`);
  }
  return {
    fired: true,
    automations_run: entries.filter((result) => result.success === true).length,
  };
}

/**
 * Fires lead_status_changed with the service key and waits for the automations
 * it starts. Throws when the call fails or one of them fails, so the step that
 * changed the status shows the failure.
 */
export async function fireLeadStatusChanged(
  change: LeadStatusChange,
  context: FanoutContext,
): Promise<FanoutResult> {
  const response = await fetch(
    `${Deno.env.get("SUPABASE_URL")}/functions/v1/trigger-automation`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify(leadStatusChangedRequest(change, context)),
    },
  );
  const reply: { error?: string; results?: Array<AutomationResult> } =
    await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `status-change automations: ${reply.error || `trigger-automation returned ${response.status}`}`,
    );
  }
  return fanoutResult(reply.results);
}
