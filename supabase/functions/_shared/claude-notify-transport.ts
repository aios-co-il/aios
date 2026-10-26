/**
 * Which Carmen send step and which WhatsApp line claude-notify uses for a
 * tenant.
 *
 * Carmen alerts leave only from a PRIMARY Carmen connection
 * (resolveCarmenConnectionRole, the rule trigger-automation's
 * isPrimaryCarmenIntegration enforces): a secondary connection, such as the
 * owner's personal phone, never sends system notifications.
 *
 * A Carmen send_manus_message step wins whenever it resolves to an active,
 * primary manus_wa line (the bridge automation's steps first). A Green API
 * step (David's operator phone) is chosen only when no Manus step resolves,
 * and is labelled "green_fallback" so callers can report it. Its line must be
 * primary too. Pure; unit tested.
 *
 * Line of a step: the line the step names (the same fields Carmen's replies
 * read in _shared/carmen.ts), used exactly or not at all. A step that names
 * no line resolves, in order, to the Carmen trigger's carmen_integration_id,
 * the line of the automation's session connection user, then the tenant's
 * oldest primary line of that provider.
 */

import {
  resolveCarmenConnectionRole,
  type CarmenConnectionRole,
} from "./carmen-connection-role.ts";

export const MANUS_SEND_ACTION = "send_manus_message";
export const GREEN_SEND_ACTIONS = [
  "send_greenapi_message",
  "send_green_api_message",
];
export const NOTIFY_SEND_ACTIONS = [MANUS_SEND_ACTION, ...GREEN_SEND_ACTIONS];
/** The only types send-manus-wa-message / send-green-api-message accept. */
export const MANUS_INTEGRATION_TYPES = ["manus_wa"];
export const GREEN_INTEGRATION_TYPES = ["green_api"];
export const CARMEN_TRIGGER_ACTION = "carmen_whatsapp_session";

export type NotifyTransport = "manus" | "green_fallback" | "none";

export type NotifyStepRow = {
  automation_id: string;
  action_type: string;
  configuration?: Record<string, any> | null;
  created_at?: string | null;
};

export type NotifyIntegrationRow = {
  id: string;
  tenant_id?: string | null;
  user_id?: string | null;
  integration_type: string;
  is_active: boolean;
  created_at?: string | null;
  settings?: Record<string, any> | null;
};

/** A line a Carmen step pointed at that was not used, and why. */
export type NotifySkippedLine = {
  automationId: string;
  integrationId: string;
  role: CarmenConnectionRole | null;
  reason: "not_primary" | "inactive" | "not_found";
};

export type NotifyTransportPlan = {
  transport: NotifyTransport;
  functionName: "send-manus-wa-message" | "send-green-api-message" | null;
  actionType: string | null;
  automationId: string | null;
  integrationId: string | null;
  integrationUserId: string | null;
  /** Carmen connection role of the chosen line; only "primary" lines are chosen. */
  integrationRole: CarmenConnectionRole | null;
  /** True when a Carmen Manus step resolves to an active, primary manus_wa line. */
  manusIntegrationActive: boolean;
  skipped: NotifySkippedLine[];
  reason: string;
};

type Provider = "manus" | "green";

export function isManusIntegration(
  row: NotifyIntegrationRow | undefined | null,
) {
  return (
    !!row && MANUS_INTEGRATION_TYPES.includes(String(row.integration_type))
  );
}

export function isGreenIntegration(
  row: NotifyIntegrationRow | undefined | null,
) {
  return (
    !!row && GREEN_INTEGRATION_TYPES.includes(String(row.integration_type))
  );
}

/** Same field order as Carmen's reply path (_shared/carmen.ts) and the step UI. */
export function stepIntegrationId(step: NotifyStepRow): string | null {
  const cfg = step.configuration || {};
  const id =
    cfg.green_api_integration_id ||
    cfg.integration_id ||
    cfg.manus_integration_id;
  return id ? String(id) : null;
}

export function tenantHasActiveManus(
  tenantId: string,
  integrations: NotifyIntegrationRow[],
): boolean {
  return integrations.some(
    (r) => r.tenant_id === tenantId && isManusIntegration(r) && r.is_active,
  );
}

export function notifyLineRole(
  row: NotifyIntegrationRow,
  hasActiveManus: boolean,
): CarmenConnectionRole {
  return resolveCarmenConnectionRole(row, {
    tenantHasActiveManus: hasActiveManus,
  });
}

export function selectNotifyTransport(input: {
  tenantId: string;
  bridgeAutomationId?: string | null;
  /** Active Carmen automations of the tenant. The bridge automation is always eligible. */
  activeAutomationIds: string[];
  steps: NotifyStepRow[];
  integrations: NotifyIntegrationRow[];
  /** automation_id → its Carmen trigger's configuration.carmen_integration_id. */
  triggerPins?: Record<string, string | null | undefined>;
  /** automation_id → connection_user_id of that automation's latest session. */
  connectionUserIds?: Record<string, string | null | undefined>;
}): NotifyTransportPlan {
  const bridge = input.bridgeAutomationId || null;
  const eligible = new Set(input.activeAutomationIds);
  if (bridge) eligible.add(bridge);

  const ordered = input.steps
    .filter((s) => eligible.has(s.automation_id))
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      const ab = a.s.automation_id === bridge ? 0 : 1;
      const bb = b.s.automation_id === bridge ? 0 : 1;
      if (ab !== bb) return ab - bb;
      const at = a.s.created_at || "";
      const bt = b.s.created_at || "";
      if (at !== bt) return at < bt ? -1 : 1;
      return a.i - b.i;
    })
    .map(({ s }) => s);

  const hasActiveManus = tenantHasActiveManus(
    input.tenantId,
    input.integrations,
  );
  const byId = new Map(input.integrations.map((r) => [r.id, r]));
  const ofProvider = (
    provider: Provider,
    row: NotifyIntegrationRow | undefined,
  ) =>
    provider === "manus" ? isManusIntegration(row) : isGreenIntegration(row);
  const isPrimary = (row: NotifyIntegrationRow) =>
    notifyLineRole(row, hasActiveManus) === "primary";
  const tenantLines = (provider: Provider) =>
    input.integrations
      .filter(
        (r) =>
          r.tenant_id === input.tenantId &&
          r.is_active &&
          ofProvider(provider, r),
      )
      .sort((a, b) => ((a.created_at || "") < (b.created_at || "") ? -1 : 1));

  const skipped: NotifySkippedLine[] = [];
  const skip = (
    automationId: string,
    integrationId: string,
    row: NotifyIntegrationRow | undefined,
    reason: NotifySkippedLine["reason"],
  ) => {
    const seen = skipped.some(
      (s) =>
        s.automationId === automationId && s.integrationId === integrationId,
    );
    if (seen) return;
    skipped.push({
      automationId,
      integrationId,
      role: row ? notifyLineRole(row, hasActiveManus) : null,
      reason,
    });
  };

  const resolveLine = (
    step: NotifyStepRow,
    provider: Provider,
  ): NotifyIntegrationRow | null => {
    const explicit = stepIntegrationId(step);
    if (explicit) {
      // The step names its line: that line or nothing.
      const row = byId.get(explicit);
      if (!row) skip(step.automation_id, explicit, row, "not_found");
      else if (!ofProvider(provider, row) || !row.is_active)
        skip(step.automation_id, explicit, row, "inactive");
      else if (!isPrimary(row))
        skip(step.automation_id, explicit, row, "not_primary");
      else return row;
      return null;
    }

    const pin = input.triggerPins?.[step.automation_id] || null;
    const connectionUser =
      input.connectionUserIds?.[step.automation_id] || null;
    const lines = tenantLines(provider);
    const candidates = [
      pin ? byId.get(String(pin)) : undefined,
      ...(connectionUser
        ? lines.filter((r) => r.user_id === connectionUser)
        : []),
      ...lines,
    ];
    for (const row of candidates) {
      if (!row || !ofProvider(provider, row) || !row.is_active) continue;
      if (isPrimary(row)) return row;
      skip(step.automation_id, row.id, row, "not_primary");
    }
    return null;
  };

  const chosen = (
    transport: "manus" | "green_fallback",
    step: NotifyStepRow,
    line: NotifyIntegrationRow,
    reason: string,
  ): NotifyTransportPlan => ({
    transport,
    functionName:
      transport === "manus"
        ? "send-manus-wa-message"
        : "send-green-api-message",
    actionType: step.action_type,
    automationId: step.automation_id,
    integrationId: line.id,
    integrationUserId: line.user_id ?? null,
    integrationRole: notifyLineRole(line, hasActiveManus),
    manusIntegrationActive: transport === "manus",
    skipped,
    reason,
  });

  const manusSteps = ordered.filter((s) => s.action_type === MANUS_SEND_ACTION);
  for (const step of manusSteps) {
    const line = resolveLine(step, "manus");
    if (line) return chosen("manus", step, line, "carmen_manus_step");
  }
  const manusReason = !manusSteps.length
    ? "no_carmen_manus_step"
    : skipped.some((s) => s.reason === "not_primary")
      ? "manus_line_not_primary"
      : "manus_integration_inactive";

  const greenSteps = ordered.filter((s) =>
    GREEN_SEND_ACTIONS.includes(s.action_type),
  );
  const manusSkipCount = skipped.length;
  for (const step of greenSteps) {
    const line = resolveLine(step, "green");
    if (line) return chosen("green_fallback", step, line, manusReason);
  }
  const greenReason = skipped
    .slice(manusSkipCount)
    .some((s) => s.reason === "not_primary")
    ? "green_line_not_primary"
    : "green_integration_inactive";

  return {
    transport: "none",
    functionName: null,
    actionType: null,
    automationId: null,
    integrationId: null,
    integrationUserId: null,
    integrationRole: null,
    manusIntegrationActive: false,
    skipped,
    reason: manusSteps.length
      ? manusReason
      : greenSteps.length
        ? greenReason
        : "no_carmen_send_step",
  };
}
