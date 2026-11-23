/**
 * What an approval asks for: the tenant and 1..CARD_DRAFTS_APPROVE_MAX
 * distinct finding ids. Anything else is refused before any read.
 */
import { CARD_DRAFTS_APPROVE_MAX } from "../_shared/manager-round/card-drafts-approve.ts";
import { asUuidOrNull } from "../_shared/uuid.ts";

export type ApproveRequest = { tenantId: string; findingIds: Array<string> };

/** The request, or the reason it is refused. */
export function parseApproveRequest(
  body: unknown,
): { ok: true; request: ApproveRequest } | { ok: false; error: string } {
  const input =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  const tenantId = asUuidOrNull(input.tenant_id);
  if (!tenantId) {
    return { ok: false, error: "invalid_tenant_id" };
  }
  const findingIds = findingIdsOf(input.finding_ids);
  if (!findingIds) {
    return { ok: false, error: "invalid_finding_ids" };
  }
  return { ok: true, request: { tenantId, findingIds } };
}

/**
 * 1..CARD_DRAFTS_APPROVE_MAX distinct uuids, lowercased as the database
 * returns them so results match the request; else null.
 */
function findingIdsOf(value: unknown): Array<string> | null {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > CARD_DRAFTS_APPROVE_MAX
  ) {
    return null;
  }
  const ids = value.flatMap((item) => {
    const id = asUuidOrNull(item);
    return id ? [id.toLowerCase()] : [];
  });
  return ids.length === value.length && new Set(ids).size === ids.length
    ? ids
    : null;
}
