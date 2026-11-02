/**
 * The Carmen automations, send steps and WhatsApp lines a tenant's notify may
 * use: the tenant's own Manus and Green lines plus the lines of other tenants
 * a step or Carmen trigger names, with which of those are shared with it.
 * DB reads only; a failed read throws.
 */

import type { DbClient } from "../_shared/supabase-clients.ts";
import {
  CARMEN_TRIGGER_ACTION,
  configRecord,
  NOTIFY_SEND_ACTIONS,
  stepIntegrationId,
  type NotifyIntegrationRow,
  type NotifyStepRow,
} from "./lines.ts";
import { loadNamedLines, loadTenantLines } from "./load-lines.ts";

export type CarmenSendSetup = {
  activeAutomationIds: string[];
  steps: NotifyStepRow[];
  integrations: NotifyIntegrationRow[];
  triggerPins: Record<string, string | null>;
  /** Lines of other tenants that a step or trigger names and that are shared with this tenant. */
  sharedLineIds: string[];
};

/** Send steps and lines of the bridge automation and every Carmen-triggered automation of the tenant. */
export async function loadCarmenSendSetup(
  sb: Pick<DbClient, "from" | "rpc">,
  tenantId: string,
  bridgeAutomationId: string | null,
): Promise<CarmenSendSetup> {
  const triggers = await loadCarmenTriggers(sb, tenantId);
  const ids = unique([
    ...triggers.map((t) => t.automation_id),
    bridgeAutomationId,
  ]);
  const triggerPins = triggerPinsOf(triggers);
  const [activeAutomationIds, steps, tenantLines] = await Promise.all([
    loadActiveAutomationIds(sb, tenantId, ids),
    loadSendSteps(sb, tenantId, ids),
    loadTenantLines(sb, tenantId),
  ]);

  const known = new Set(tenantLines.map((r) => r.id));
  const referenced = unique([
    ...steps.map(stepIntegrationId),
    ...Object.values(triggerPins),
  ]).filter((id) => !known.has(id));
  const named = await loadNamedLines(sb, tenantId, referenced);
  return {
    activeAutomationIds,
    steps,
    integrations: [...tenantLines, ...named.rows],
    triggerPins,
    sharedLineIds: named.sharedIds,
  };
}

/** The tenant's Carmen WhatsApp-session triggers. */
async function loadCarmenTriggers(
  sb: Pick<DbClient, "from">,
  tenantId: string,
) {
  const { data, error } = await sb
    .from("automation_flow_steps")
    .select("automation_id, configuration")
    .eq("tenant_id", tenantId)
    .eq("step_type", "trigger")
    .eq("action_type", CARMEN_TRIGGER_ACTION);
  if (error) {
    throw new Error(
      `claude-notify: load Carmen triggers failed: ${error.message}`,
    );
  }
  return data ?? [];
}

/** automation_id → its first Carmen trigger's carmen_integration_id. */
function triggerPinsOf(
  triggers: Pick<NotifyStepRow, "automation_id" | "configuration">[],
): Record<string, string | null> {
  const pins: Record<string, string | null> = {};
  for (const t of triggers) {
    const pin = configRecord(t.configuration).carmen_integration_id;
    if (pin && !pins[t.automation_id]) {
      pins[t.automation_id] = String(pin);
    }
  }
  return pins;
}

/** Which of these automations of the tenant are active. */
async function loadActiveAutomationIds(
  sb: Pick<DbClient, "from">,
  tenantId: string,
  ids: string[],
): Promise<string[]> {
  if (!ids.length) {
    return [];
  }
  const { data, error } = await sb
    .from("automations")
    .select("id, active")
    .eq("tenant_id", tenantId)
    .in("id", ids);
  if (error) {
    throw new Error(`claude-notify: load automations failed: ${error.message}`);
  }
  return (data ?? []).filter((a) => a.active === true).map((a) => a.id);
}

/** Manus and Green send steps of these automations, oldest first. */
async function loadSendSteps(
  sb: Pick<DbClient, "from">,
  tenantId: string,
  ids: string[],
): Promise<NotifyStepRow[]> {
  if (!ids.length) {
    return [];
  }
  const { data, error } = await sb
    .from("automation_flow_steps")
    .select("automation_id, action_type, configuration, created_at")
    .eq("tenant_id", tenantId)
    .in("automation_id", ids)
    .eq("step_type", "action")
    .in("action_type", NOTIFY_SEND_ACTIONS)
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(`claude-notify: load send steps failed: ${error.message}`);
  }
  return data ?? [];
}

/** Distinct non-empty values, first occurrence first. */
function unique(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => v != null && v !== ""))];
}
