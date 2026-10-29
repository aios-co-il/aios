/**
 * Whether a Carmen step may send from a line, and who the send goes out as:
 * the rule the senders apply (mayUseLine, _shared/auth/tenant-access.ts) over
 * the sharing and super-admin lookups claude-notify makes up front. Pure.
 */

import type { NotifyIntegrationRow, NotifyStepRow } from "./lines.ts";

export type Provider = "manus" | "green";

/** What the rule reads from a transport selection's input. */
export type LineAccessInput = {
  tenantId: string;
  /** automation_id → who its send goes out as: its latest session's connection user, else the bridge session's. */
  senderUserIds?: Record<string, string | null | undefined>;
  /** Lines of other tenants that are shared with this tenant. */
  sharedLineIds?: string[];
  /** The possible senders who are super admins. */
  superAdminUserIds?: string[];
};

/**
 * Who a send of this step from this line goes out as: the automation's
 * session user, else (on the tenant's own Manus line only) the line's own
 * user. Another tenant's line never lends its owner, so the owner's
 * super-admin access cannot open that line to this tenant.
 */
export function stepSender(
  input: LineAccessInput,
  step: NotifyStepRow,
  line: NotifyIntegrationRow,
  provider: Provider,
): string | null {
  const ownManus = provider === "manus" && line.tenant_id === input.tenantId;
  return (
    input.senderUserIds?.[step.automation_id] ||
    (ownManus ? line.user_id : null) ||
    null
  );
}

/** The tenant's own line, one shared with it, or any line when the step's session sender is a super admin. */
export function stepMayUseLine(
  input: LineAccessInput,
  step: NotifyStepRow,
  line: NotifyIntegrationRow,
  provider: Provider,
): boolean {
  if (
    line.tenant_id === input.tenantId ||
    input.sharedLineIds?.includes(line.id)
  ) {
    return true;
  }
  const sender = stepSender(input, step, line, provider);
  return !!sender && !!input.superAdminUserIds?.includes(sender);
}
