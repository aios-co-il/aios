/** The NotifyTransportPlan selectNotifyTransport returns, for a chosen line or for none. */

import {
  resolveCarmenConnectionRole,
  type CarmenConnectionRole,
} from "../_shared/carmen-connection-role.ts";
import { SEND_MANUS_FN } from "../_shared/whatsapp/send-result.ts";
import type { NotifyIntegrationRow, NotifyStepRow } from "./lines.ts";
import type { NotifySkippedLine, TransportContext } from "./step-line.ts";

export type NotifyTransport = "manus" | "green_fallback" | "none";

export type NotifyTransportPlan = {
  transport: NotifyTransport;
  functionName: typeof SEND_MANUS_FN | "send-green-api-message" | null;
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

/** The plan for a chosen step and line. */
export function transportPlan(
  ctx: TransportContext,
  transport: "manus" | "green_fallback",
  step: NotifyStepRow,
  line: NotifyIntegrationRow,
  reason: string,
): NotifyTransportPlan {
  return {
    transport,
    functionName:
      transport === "manus" ? SEND_MANUS_FN : "send-green-api-message",
    actionType: step.action_type,
    automationId: step.automation_id,
    integrationId: line.id,
    integrationUserId: line.user_id ?? null,
    integrationRole: resolveCarmenConnectionRole(line, {
      tenantHasActiveManus: ctx.hasActiveManus,
    }),
    manusIntegrationActive: transport === "manus",
    skipped: ctx.skipped,
    reason,
  };
}

/** The plan when no step resolves to a usable line. */
export function noTransport(
  skipped: NotifySkippedLine[],
  reason: string,
): NotifyTransportPlan {
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
    reason,
  };
}
