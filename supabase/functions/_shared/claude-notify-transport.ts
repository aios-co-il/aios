/**
 * Which Carmen send step claude-notify uses for a tenant.
 *
 * Carmen alerts leave from her own Manus line: a Carmen send_manus_message
 * step wins whenever its manus_wa integration is active (the bridge
 * automation's step first). A Green API step (David's operator phone) is
 * chosen only when the tenant has no active Manus step, and is labelled
 * "green_fallback" so callers can report it. Pure; unit tested.
 */

export const MANUS_SEND_ACTION = "send_manus_message";
export const GREEN_SEND_ACTIONS = [
  "send_greenapi_message",
  "send_green_api_message",
];
export const NOTIFY_SEND_ACTIONS = [MANUS_SEND_ACTION, ...GREEN_SEND_ACTIONS];
export const MANUS_INTEGRATION_TYPES = ["manus_wa", "manuswa"];
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
};

export type NotifyTransportPlan = {
  transport: NotifyTransport;
  functionName: "send-manus-wa-message" | "send-green-api-message" | null;
  actionType: string | null;
  automationId: string | null;
  integrationId: string | null;
  integrationUserId: string | null;
  /** True when a Carmen Manus step resolves to an active manus_wa integration. */
  manusIntegrationActive: boolean;
  reason: string;
};

export function isManusIntegration(
  row: NotifyIntegrationRow | undefined | null,
) {
  return (
    !!row && MANUS_INTEGRATION_TYPES.includes(String(row.integration_type))
  );
}

export function stepIntegrationId(step: NotifyStepRow): string | null {
  const cfg = step.configuration || {};
  const id =
    step.action_type === MANUS_SEND_ACTION
      ? cfg.integration_id ||
        cfg.manus_integration_id ||
        cfg.green_api_integration_id
      : cfg.green_api_integration_id || cfg.integration_id;
  return id ? String(id) : null;
}

export function selectNotifyTransport(input: {
  tenantId: string;
  bridgeAutomationId?: string | null;
  /** Active Carmen automations of the tenant. The bridge automation is always eligible. */
  activeAutomationIds: string[];
  steps: NotifyStepRow[];
  integrations: NotifyIntegrationRow[];
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

  const byId = new Map(input.integrations.map((r) => [r.id, r]));
  const tenantManus = input.integrations
    .filter(
      (r) =>
        r.tenant_id === input.tenantId && isManusIntegration(r) && r.is_active,
    )
    .sort((a, b) => ((a.created_at || "") < (b.created_at || "") ? -1 : 1));

  const manusSteps = ordered.filter((s) => s.action_type === MANUS_SEND_ACTION);
  for (const step of manusSteps) {
    const explicit = stepIntegrationId(step);
    const integration = explicit ? byId.get(explicit) : tenantManus[0];
    if (isManusIntegration(integration) && integration!.is_active) {
      return {
        transport: "manus",
        functionName: "send-manus-wa-message",
        actionType: step.action_type,
        automationId: step.automation_id,
        integrationId: integration!.id,
        integrationUserId: integration!.user_id ?? null,
        manusIntegrationActive: true,
        reason: "carmen_manus_step",
      };
    }
  }

  const greenStep = ordered.find((s) =>
    GREEN_SEND_ACTIONS.includes(s.action_type),
  );
  if (greenStep) {
    return {
      transport: "green_fallback",
      functionName: "send-green-api-message",
      actionType: greenStep.action_type,
      automationId: greenStep.automation_id,
      integrationId: stepIntegrationId(greenStep),
      integrationUserId: null,
      manusIntegrationActive: false,
      reason: manusSteps.length
        ? "manus_integration_inactive"
        : "no_carmen_manus_step",
    };
  }

  return {
    transport: "none",
    functionName: null,
    actionType: null,
    automationId: null,
    integrationId: null,
    integrationUserId: null,
    manusIntegrationActive: false,
    reason: manusSteps.length
      ? "manus_integration_inactive"
      : "no_carmen_send_step",
  };
}
