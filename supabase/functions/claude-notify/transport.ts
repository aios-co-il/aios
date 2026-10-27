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
 * primary too. Pure; unit tested. How a step resolves to a line: step-line.ts.
 */

import {
  GREEN_SEND_ACTIONS,
  MANUS_SEND_ACTION,
  tenantHasActiveManus,
  type NotifyStepRow,
} from "./lines.ts";
import {
  resolveStepLine,
  type NotifySkippedLine,
  type NotifyTransportInput,
  type TransportContext,
} from "./step-line.ts";
import {
  noTransport,
  transportPlan,
  type NotifyTransportPlan,
} from "./transport-plan.ts";

/** The step and line a notify for this tenant leaves from, or "none" with the reason. */
export function selectNotifyTransport(
  input: NotifyTransportInput,
): NotifyTransportPlan {
  const ctx: TransportContext = {
    input,
    hasActiveManus: tenantHasActiveManus(input.tenantId, input.integrations),
    byId: new Map(input.integrations.map((r) => [r.id, r])),
    skipped: [],
  };
  const ordered = orderSteps(input);

  const manusSteps = ordered.filter((s) => s.action_type === MANUS_SEND_ACTION);
  for (const step of manusSteps) {
    const line = resolveStepLine(ctx, step, "manus");
    if (line) {
      return transportPlan(ctx, "manus", step, line, "carmen_manus_step");
    }
  }
  const manusReason = !manusSteps.length
    ? "no_carmen_manus_step"
    : missReason(
        ctx.skipped,
        "manus_line_not_primary",
        "manus_integration_inactive",
      );

  const greenSteps = ordered.filter((s) =>
    GREEN_SEND_ACTIONS.includes(s.action_type ?? ""),
  );
  const manusSkipCount = ctx.skipped.length;
  for (const step of greenSteps) {
    const line = resolveStepLine(ctx, step, "green");
    if (line) {
      return transportPlan(ctx, "green_fallback", step, line, manusReason);
    }
  }

  if (manusSteps.length) {
    return noTransport(ctx.skipped, manusReason);
  }
  if (greenSteps.length) {
    const greenSkips = ctx.skipped.slice(manusSkipCount);
    return noTransport(
      ctx.skipped,
      missReason(
        greenSkips,
        "green_line_not_primary",
        "green_integration_inactive",
      ),
    );
  }
  return noTransport(ctx.skipped, "no_carmen_send_step");
}

/** Eligible steps, the bridge automation's first, then oldest first. */
function orderSteps(input: NotifyTransportInput): NotifyStepRow[] {
  const bridge = input.bridgeAutomationId || null;
  const eligible = new Set(input.activeAutomationIds);
  if (bridge) {
    eligible.add(bridge);
  }
  return input.steps
    .filter((s) => eligible.has(s.automation_id))
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      const ab = a.s.automation_id === bridge ? 0 : 1;
      const bb = b.s.automation_id === bridge ? 0 : 1;
      if (ab !== bb) {
        return ab - bb;
      }
      const at = a.s.created_at || "";
      const bt = b.s.created_at || "";
      if (at !== bt) {
        return at < bt ? -1 : 1;
      }
      return a.i - b.i;
    })
    .map(({ s }) => s);
}

/** Why no line of a provider was usable: a non-primary skip, else inactive. */
function missReason(
  skipped: NotifySkippedLine[],
  notPrimary: string,
  inactive: string,
): string {
  return skipped.some((s) => s.reason === "not_primary")
    ? notPrimary
    : inactive;
}
