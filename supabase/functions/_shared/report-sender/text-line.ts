// The line a WhatsApp text send goes out from (AIO-255). send-green-api-message
// and send-manus-wa-message take their line only from sendLine, so
// text-line.test.ts covers the named-line refusal at the step the send
// depends on.
import type { LineStore, SenderLine } from "./line-store.ts";
import { namedLineRefusal, type SendRefusal } from "./refusals.ts";
import type { ReportSenderType } from "./types.ts";

/** The line reads; each sender's liveLineDeps() backs them with the DB. */
export type LineDeps = {
  store: LineStore;
  /** The caller's own line of the sender's type in the tenant, else null. */
  ownLine(tenantId: string, userId: string): Promise<SenderLine | null>;
};

/** A refused send, or the line to send from (null when none is set up). */
export type LineStep = { refusal: SendRefusal } | { line: SenderLine | null };

/**
 * The line this send of `type` uses. A user's call that names a line they
 * may not send from is refused (namedLineRefusal). Otherwise a named line
 * counts when the tenant owns it or was shared it (the row stays in the
 * owner tenant), or the sender is a super admin; without one, the caller's
 * own line.
 */
export async function sendLine(
  deps: LineDeps,
  input: {
    type: ReportSenderType;
    isServiceRole: boolean;
    tenantId: string;
    userId: string;
    integrationId: string | null | undefined;
    superAdmin: boolean;
  },
): Promise<LineStep> {
  const refusal = await namedLineRefusal(deps.store, input);
  if (refusal) {
    return { refusal };
  }
  if (!input.integrationId) {
    return { line: await deps.ownLine(input.tenantId, input.userId) };
  }
  const line = await deps.store.findActiveLine(input.integrationId, input.type);
  if (!line || line.tenant_id === input.tenantId || input.superAdmin) {
    return { line };
  }
  const shared = await deps.store.tenantCanUse(input.tenantId, line.id);
  return { line: shared ? line : null };
}
