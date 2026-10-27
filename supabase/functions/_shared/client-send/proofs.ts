// What proves a service-role send was asked for by something the tenant set
// up: an enabled report schedule, a broadcast being dispatched, an active
// automation. Every read is keyed by the sending tenant. A ref that is not
// a uuid proves nothing, so it never reaches a uuid column.
import { isRecord } from "../client-card/is-record.ts";
import type { DbClient } from "../supabase-clients.ts";
import { asUuidOrNull } from "../uuid.ts";

type ProofDb = Pick<DbClient, "from">;

/** The client of the tenant's enabled report schedule, else null. */
export async function reportScheduleClient(
  db: ProofDb,
  input: { tenantId: string; scheduleId: string },
): Promise<string | null> {
  const scheduleId = asUuidOrNull(input.scheduleId);
  if (!scheduleId) {
    return null;
  }
  const { data, error } = await db
    .from("report_schedules")
    .select("client_id")
    .eq("id", scheduleId)
    .eq("tenant_id", input.tenantId)
    .eq("enabled", true)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data?.client_id ?? null;
}

/** Whether the broadcast is the tenant's and is being dispatched now. */
export async function broadcastIsSending(
  db: ProofDb,
  input: { tenantId: string; broadcastId: string },
): Promise<boolean> {
  const broadcastId = asUuidOrNull(input.broadcastId);
  if (!broadcastId) {
    return false;
  }
  const { data, error } = await db
    .from("broadcasts")
    .select("id")
    .eq("id", broadcastId)
    .eq("tenant_id", input.tenantId)
    .eq("status", "sending")
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data !== null;
}

export type AutomationTarget = {
  /** The one client the automation is set for, if any. */
  clientId: string | null;
  /** The trigger: a flow's trigger step, else the automation's type. */
  triggerType: string;
};

/**
 * An active automation the tenant runs, its own or one shared into it. A flow
 * names its client on its trigger step; a single-step automation in its
 * configuration or its conditions.
 */
export async function automationTarget(
  db: ProofDb,
  input: { tenantId: string; automationId: string },
): Promise<AutomationTarget | null> {
  const automationId = asUuidOrNull(input.automationId);
  if (!automationId) {
    return null;
  }
  const shared = await isSharedInto(db, automationId, input.tenantId);
  let query = db
    .from("automations")
    .select("id, is_flow, trigger_type, configuration, conditions")
    .eq("id", automationId)
    .eq("active", true);
  if (!shared) {
    query = query.eq("tenant_id", input.tenantId);
  }
  const { data: automation, error } = await query.maybeSingle();
  if (error) {
    throw error;
  }
  if (!automation) {
    return null;
  }
  if (!automation.is_flow) {
    return {
      clientId:
        configuredClient(automation.configuration) ??
        configuredClient(automation.conditions),
      triggerType: automation.trigger_type,
    };
  }
  const trigger = await flowTriggerStep(db, automationId);
  return {
    clientId: configuredClient(trigger?.configuration),
    triggerType: trigger?.action_type ?? automation.trigger_type,
  };
}

/** Whether another tenant shared the automation into this one. */
async function isSharedInto(
  db: ProofDb,
  automationId: string,
  tenantId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("automation_shared_tenants")
    .select("automation_id")
    .eq("automation_id", automationId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data !== null;
}

/** A flow's trigger step, which holds its client and its trigger. */
async function flowTriggerStep(db: ProofDb, automationId: string) {
  const { data, error } = await db
    .from("automation_flow_steps")
    .select("action_type, configuration")
    .eq("automation_id", automationId)
    .eq("step_type", "trigger")
    .order("sort_order")
    .limit(1)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data;
}

/** configuration.client_id or conditions.client_id, when it is a uuid. */
function configuredClient(value: unknown): string | null {
  return isRecord(value) ? asUuidOrNull(value.client_id) : null;
}
