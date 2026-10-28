// The Manus line a text send goes out from (AIO-255). The handler takes
// its line only from sendLine, so line.test.ts covers the named-line refusal
// at the step the send depends on.
import {
  type LineStore,
  lineStore,
  type SenderLine,
} from "../_shared/report-sender/line-store.ts";
import {
  namedLineRefusal,
  type SendRefusal,
} from "../_shared/report-sender/refusals.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";

/** The line reads; liveLineDeps() backs them with the service-role client. */
export type LineDeps = {
  store: LineStore;
  /** The caller's oldest active Manus line in the tenant, else null. */
  ownLine(tenantId: string, userId: string): Promise<SenderLine | null>;
};

/** A refused send, or the line to send from (null when none is set up). */
export type LineStep = { refusal: SendRefusal } | { line: SenderLine | null };

/**
 * The line this send uses. A user's call that names a line they may not send
 * from is refused (namedLineRefusal). Otherwise a named line counts when the
 * tenant owns it or was shared it (the row stays in the owner tenant), or the
 * sender is a super admin; without one, the caller's own line.
 */
export async function sendLine(
  deps: LineDeps,
  input: {
    isServiceRole: boolean;
    tenantId: string;
    userId: string;
    integrationId: string | null | undefined;
    superAdmin: boolean;
  },
): Promise<LineStep> {
  const refusal = await namedLineRefusal(deps.store, {
    ...input,
    type: "manus_wa",
  });
  if (refusal) {
    return { refusal };
  }
  if (!input.integrationId) {
    return { line: await deps.ownLine(input.tenantId, input.userId) };
  }
  const line = await deps.store.findActiveLine(input.integrationId, "manus_wa");
  if (!line || line.tenant_id === input.tenantId || input.superAdmin) {
    return { line };
  }
  const shared = await deps.store.tenantCanUse(input.tenantId, line.id);
  return { line: shared ? line : null };
}

/** LineDeps over the service-role client. */
export function liveLineDeps(admin: DbClient): LineDeps {
  return {
    store: lineStore(admin),
    async ownLine(tenantId, userId) {
      const { data, error } = await admin
        .from("tenant_integrations")
        .select("id, tenant_id, user_id, api_key, settings")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .eq("integration_type", "manus_wa")
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1);
      if (error) {
        throw error;
      }
      return data[0] ?? null;
    },
  };
}
