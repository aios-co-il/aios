/**
 * What a manual run asks for: the tenant and one check an owner may run
 * (RUNNABLE_COLLECTORS). Anything else is refused before any read.
 */
import {
  isRunnableCollector,
  type RunnableCollectorId,
} from "../_shared/manager-round/runnable-collectors.ts";
import { asUuidOrNull } from "../_shared/uuid.ts";

export type RunRequest = { tenantId: string; collector: RunnableCollectorId };

/** The request, or the reason it is refused. */
export function parseRunRequest(
  body: unknown,
): { ok: true; request: RunRequest } | { ok: false; error: string } {
  const input =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  const tenantId = asUuidOrNull(input.tenant_id);
  if (!tenantId) {
    return { ok: false, error: "invalid_tenant_id" };
  }
  if (!isRunnableCollector(input.collector)) {
    return { ok: false, error: "unknown_collector" };
  }
  return { ok: true, request: { tenantId, collector: input.collector } };
}
