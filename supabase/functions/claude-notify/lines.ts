/**
 * The Carmen send steps and WhatsApp lines claude-notify chooses between, as
 * read from automation_flow_steps and tenant_integrations.
 */

import type { Json, Tables } from "../_shared/database.types.ts";
import { MANUS_WA_TYPES } from "../_shared/whatsapp/send-result.ts";

export const MANUS_SEND_ACTION = "send_manus_message";
export const GREEN_SEND_ACTIONS = [
  "send_greenapi_message",
  "send_green_api_message",
];
export const NOTIFY_SEND_ACTIONS = [MANUS_SEND_ACTION, ...GREEN_SEND_ACTIONS];
/** The only type send-green-api-message accepts. */
export const GREEN_INTEGRATION_TYPES = ["green_api"];
export const CARMEN_TRIGGER_ACTION = "carmen_whatsapp_session";

export type NotifyStepRow = Pick<
  Tables<"automation_flow_steps">,
  "automation_id" | "action_type" | "configuration" | "created_at"
>;

export type NotifyIntegrationRow = Pick<
  Tables<"tenant_integrations">,
  | "id"
  | "tenant_id"
  | "user_id"
  | "integration_type"
  | "is_active"
  | "created_at"
  | "settings"
>;

/**
 * The line a Manus or Green send step names: green_api_integration_id, then
 * integration_id (the field the step UI writes). Same fields and order as
 * Carmen's reply path for these steps (sendCarmenReplyViaActionStep in
 * _shared/carmen.ts).
 */
export function stepIntegrationId(step: NotifyStepRow): string | null {
  const cfg = configRecord(step.configuration);
  const id = cfg.green_api_integration_id || cfg.integration_id;
  return id ? String(id) : null;
}

/** Oldest first by created_at; a missing timestamp sorts first. */
export function compareCreatedAt(
  a: { created_at: string | null },
  b: { created_at: string | null },
): number {
  const x = a.created_at || "";
  const y = b.created_at || "";
  if (x === y) {
    return 0;
  }
  return x < y ? -1 : 1;
}

/** True for a line send-manus-wa-message can send from. */
export function isManusIntegration(
  row: NotifyIntegrationRow | undefined | null,
): boolean {
  return !!row && MANUS_WA_TYPES.includes(row.integration_type);
}

/** True for a line send-green-api-message can send from. */
export function isGreenIntegration(
  row: NotifyIntegrationRow | undefined | null,
): boolean {
  return !!row && GREEN_INTEGRATION_TYPES.includes(row.integration_type);
}

/** Whether the tenant has an active Manus line of its own (decides Green's role). */
export function tenantHasActiveManus(
  tenantId: string,
  integrations: NotifyIntegrationRow[],
): boolean {
  return integrations.some(
    (r) => r.tenant_id === tenantId && isManusIntegration(r) && r.is_active,
  );
}

/** A JSON configuration column as an object, or {} when it is not one. */
export function configRecord(
  value: Json | null | undefined,
): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}
