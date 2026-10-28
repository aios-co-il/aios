/**
 * Line of a Carmen send step: the line the step names (the same fields
 * Carmen's replies read in _shared/carmen.ts), used exactly or not at all. A
 * step that names no line resolves, in order, to the Carmen trigger's
 * carmen_integration_id, the line of the automation's session connection
 * user, then the tenant's oldest primary line of that provider. Another
 * tenant's line is used only when the senders would accept it
 * (line-access.ts). Lines that are passed over are recorded in `skipped` with
 * the reason.
 */

import {
  isPrimaryCarmenLine,
  resolveCarmenConnectionRole,
  type CarmenConnectionRole,
} from "../_shared/carmen-connection-role.ts";
import {
  stepMayUseLine,
  type LineAccessInput,
  type Provider,
} from "./line-access.ts";
import {
  compareCreatedAt,
  isGreenIntegration,
  isManusIntegration,
  stepIntegrationId,
  type NotifyIntegrationRow,
  type NotifyStepRow,
} from "./lines.ts";

export type NotifyTransportInput = LineAccessInput & {
  bridgeAutomationId?: string | null;
  /** Active Carmen automations of the tenant. The bridge automation is always eligible. */
  activeAutomationIds: string[];
  steps: NotifyStepRow[];
  integrations: NotifyIntegrationRow[];
  /** automation_id → its Carmen trigger's configuration.carmen_integration_id. */
  triggerPins?: Record<string, string | null | undefined>;
  /** automation_id → connection_user_id of that automation's latest session. */
  connectionUserIds?: Record<string, string | null | undefined>;
};

/** A line a Carmen step pointed at that was not used, and why. */
export type NotifySkippedLine = {
  automationId: string;
  integrationId: string;
  role: CarmenConnectionRole | null;
  reason: "not_primary" | "inactive" | "not_found" | "not_shared";
};

/** One transport selection: its input, lookups, and the lines skipped so far. */
export type TransportContext = {
  input: NotifyTransportInput;
  /** The notifying tenant's own; another tenant's line uses ownerHasActiveManus. */
  hasActiveManus: boolean;
  byId: Map<string, NotifyIntegrationRow>;
  skipped: NotifySkippedLine[];
};

/** The active, primary line of `provider` this step sends from, or null. */
export function resolveStepLine(
  ctx: TransportContext,
  step: NotifyStepRow,
  provider: Provider,
): NotifyIntegrationRow | null {
  const named = stepIntegrationId(step);
  if (named) {
    return namedLine(ctx, step, named, provider);
  }
  for (const row of candidateLines(ctx, step, provider)) {
    if (!row || !ofProvider(provider, row) || !row.is_active) {
      continue;
    }
    if (!stepMayUseLine(ctx.input, step, row, provider)) {
      skipLine(ctx, step.automation_id, row.id, row, "not_shared");
      continue;
    }
    if (isPrimaryCarmenLine(row, ownerHasActiveManus(ctx, row))) {
      return row;
    }
    skipLine(ctx, step.automation_id, row.id, row, "not_primary");
  }
  return null;
}

/** The step names its line: that line or nothing. */
function namedLine(
  ctx: TransportContext,
  step: NotifyStepRow,
  integrationId: string,
  provider: Provider,
): NotifyIntegrationRow | null {
  const row = ctx.byId.get(integrationId);
  if (!row) {
    skipLine(ctx, step.automation_id, integrationId, row, "not_found");
    return null;
  }
  if (!stepMayUseLine(ctx.input, step, row, provider)) {
    skipLine(ctx, step.automation_id, integrationId, row, "not_shared");
    return null;
  }
  if (!ofProvider(provider, row) || !row.is_active) {
    skipLine(ctx, step.automation_id, integrationId, row, "inactive");
    return null;
  }
  if (!isPrimaryCarmenLine(row, ownerHasActiveManus(ctx, row))) {
    skipLine(ctx, step.automation_id, integrationId, row, "not_primary");
    return null;
  }
  return row;
}

/** Trigger pin, then the session user's lines, then every tenant line (oldest first). */
function candidateLines(
  ctx: TransportContext,
  step: NotifyStepRow,
  provider: Provider,
): (NotifyIntegrationRow | undefined)[] {
  const pin = ctx.input.triggerPins?.[step.automation_id] || null;
  const connectionUser =
    ctx.input.connectionUserIds?.[step.automation_id] || null;
  const lines = ctx.input.integrations
    .filter(
      (r) =>
        r.tenant_id === ctx.input.tenantId &&
        r.is_active &&
        ofProvider(provider, r),
    )
    .sort(compareCreatedAt);
  return [
    pin ? ctx.byId.get(pin) : undefined,
    ...(connectionUser
      ? lines.filter((r) => r.user_id === connectionUser)
      : []),
    ...lines,
  ];
}

/** Records a passed-over line once per automation. */
function skipLine(
  ctx: TransportContext,
  automationId: string,
  integrationId: string,
  row: NotifyIntegrationRow | undefined,
  reason: NotifySkippedLine["reason"],
): void {
  const seen = ctx.skipped.some(
    (s) => s.automationId === automationId && s.integrationId === integrationId,
  );
  if (seen) {
    return;
  }
  ctx.skipped.push({
    automationId,
    integrationId,
    role: row
      ? resolveCarmenConnectionRole(row, {
          tenantHasActiveManus: ownerHasActiveManus(ctx, row),
        })
      : null,
    reason,
  });
}

/**
 * Whether the line's own tenant has an active Manus line, which decides a
 * Green line's implicit role. Another tenant's Manus lines are not loaded, so
 * for its line this is assumed true: its Green line is primary only when
 * settings.carmen_role says so, and never because this tenant lacks Manus.
 */
export function ownerHasActiveManus(
  ctx: TransportContext,
  row: NotifyIntegrationRow,
): boolean {
  return row.tenant_id === ctx.input.tenantId ? ctx.hasActiveManus : true;
}

/** Whether a line belongs to the step's provider. */
function ofProvider(
  provider: Provider,
  row: NotifyIntegrationRow | undefined,
): boolean {
  return provider === "manus"
    ? isManusIntegration(row)
    : isGreenIntegration(row);
}
