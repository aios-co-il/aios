/**
 * claude-notify's { ping: true } mode: per tenant, which step type and line a
 * send would use, the line's Carmen role and the tenant's Manus line counts.
 * It sends nothing.
 */

import type { DbClient } from "../_shared/supabase-clients.ts";
import { CARMEN_TRIGGER_ACTION } from "./lines.ts";
import { planTenantNotify, type TenantNotifyPlan } from "./plan.ts";

const PING_TENANT_LIMIT = 200;
const PING_CONCURRENCY = 8;

/** Ping reports for one tenant, or for every Carmen or pulse tenant (up to 200) in batches of 8. */
export async function pingTenants(
  sb: Pick<DbClient, "from" | "rpc">,
  tenantId: string,
): Promise<ReturnType<typeof pingReport>[]> {
  const tenantIds = tenantId ? [tenantId] : await listNotifyTenants(sb);
  const reports = [];
  for (let i = 0; i < tenantIds.length; i += PING_CONCURRENCY) {
    const batch = tenantIds.slice(i, i + PING_CONCURRENCY);
    const plans = await Promise.all(
      batch.map((id) => planTenantNotify(sb, id, null)),
    );
    reports.push(...plans.map(pingReport));
  }
  return reports;
}

/** What ping shows for one tenant's notify plan. */
export function pingReport(plan: TenantNotifyPlan) {
  return {
    tenant_id: plan.tenantId,
    transport: plan.transport.transport,
    step_type: plan.transport.actionType,
    automation_id: plan.transport.automationId,
    integration_id: plan.transport.integrationId,
    integration_role: plan.transport.integrationRole,
    integration_primary: plan.transport.integrationRole === "primary",
    manus_integration_active: plan.transport.manusIntegrationActive,
    active_manus_integrations: plan.activeManusIntegrations,
    primary_manus_integrations: plan.primaryManusIntegrations,
    skipped_lines: plan.transport.skipped.map((s) => ({
      automation_id: s.automationId,
      integration_id: s.integrationId,
      role: s.role,
      reason: s.reason,
    })),
    recipient_source: plan.target.source,
    sender_resolved: !!plan.senderUserId,
    reason: plan.transport.reason,
  };
}

/** Tenants with a Carmen trigger or campaign pulse enabled, sorted, at most 200. */
async function listNotifyTenants(
  sb: Pick<DbClient, "from">,
): Promise<string[]> {
  const [triggers, pulse] = await Promise.all([
    sb
      .from("automation_flow_steps")
      .select("tenant_id")
      .eq("step_type", "trigger")
      .eq("action_type", CARMEN_TRIGGER_ACTION),
    sb
      .from("tenant_heartbeat_settings")
      .select("tenant_id")
      .eq("campaign_pulse_enabled", true),
  ]);
  const error = triggers.error ?? pulse.error;
  if (error) {
    throw new Error(
      `claude-notify: list ping tenants failed: ${error.message}`,
    );
  }
  const ids = [
    ...(triggers.data ?? []).map((r) => r.tenant_id),
    ...(pulse.data ?? []).map((r) => r.tenant_id),
  ].filter((id) => !!id);
  return [...new Set(ids)].sort().slice(0, PING_TENANT_LIMIT);
}
