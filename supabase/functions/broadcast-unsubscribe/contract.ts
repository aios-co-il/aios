// The public JSON contract of broadcast-unsubscribe, shared by the edge
// handler and the app's /unsubscribe/:tenantSlug page. It carries the
// organization name only, never the recipient's phone, email or name.

export type UnsubscribeError =
  "invalid_link" | "not_found" | "method_not_allowed" | "internal_error";

export type UnsubscribeAnswer =
  { ok: true; tenant_name: string } | { ok: false; error: UnsubscribeError };

/** A broadcast recipient id: the only credential the link carries. */
export const RECIPIENT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The tenant name from a success answer, or null for anything else. */
export function tenantNameOf(data: unknown): string | null {
  if (
    !data ||
    typeof data !== "object" ||
    !("ok" in data) ||
    !("tenant_name" in data)
  ) {
    return null;
  }
  const { ok, tenant_name: name } = data;
  return ok === true && typeof name === "string" ? name : null;
}
