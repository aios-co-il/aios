// Server-side checks of the line a send names (AIO-255), and whether a caller
// may send for a tenant. The WhatsApp senders run with the service role once
// the caller is known, so they check tenant access themselves.
import type { Json } from "../database.types.ts";
import type { LineStore, SenderLine } from "./line-store.ts";
import type { ReportSenderType } from "./types.ts";

/** Who asked for the send: a signed-in user, or a function (service role). */
export type SendCaller = "user" | "service";

/** Why a send has no line: the named one is refused, or none is set up. */
export type LineError = "sender_not_allowed" | "not_configured";

export type LineChoice = { line: SenderLine } | { error: LineError };

/**
 * The line a file send goes out from. A named line is never swapped for
 * another: an invalid choice used to fall back silently to a different
 * phone. A user's call may name only a line loadSenderLine gives them. A
 * service-role call (broadcasts) keeps the tenant check it always had, a
 * line the tenant owns or was shared: those callers pick the line
 * themselves. Without a named line, `fallback` gives the line older callers
 * relied on.
 */
export async function resolveSenderLine(
  store: LineStore,
  input: {
    caller: SendCaller;
    tenantId: string;
    userId: string;
    integrationId: string | null;
    type: ReportSenderType;
  },
  fallback: () => Promise<SenderLine | null>,
): Promise<LineChoice> {
  const { integrationId } = input;
  if (!integrationId) {
    const line = await fallback();
    return line && lineIsReady(line) ? { line } : { error: "not_configured" };
  }
  const line =
    input.caller === "user"
      ? await loadSenderLine(store, { ...input, integrationId })
      : await loadTenantLine(store, { ...input, integrationId });
  if (!line) {
    return { error: "sender_not_allowed" };
  }
  return lineIsReady(line) ? { line } : { error: "not_configured" };
}

/** Whether userId may send for tenantId: a member of it, or a super admin. */
export async function callerMaySendForTenant(
  store: LineStore,
  tenantId: string,
  userId: string,
): Promise<boolean> {
  if (!tenantId || !userId) {
    return false;
  }
  const [member, superAdmin] = await Promise.all([
    store.isMember(tenantId, userId),
    store.isSuperAdmin(userId),
  ]);
  return member || superAdmin;
}

/**
 * The line an explicit integrationId names, when userId may send the
 * tenant's reports from it: active, of the expected type, and usable by the
 * same SQL rule that lists lines (owned by the tenant through a member, or
 * shared with it, and within user_has_integration_permission inside the
 * tenant, so never another member's private line). Null otherwise, and the
 * caller refuses the send rather than pick another line. A super admin may
 * use any line of the tenant, never one the tenant neither owns nor was
 * given.
 */
export async function loadSenderLine(
  store: LineStore,
  input: {
    tenantId: string;
    userId: string;
    integrationId: string;
    type: ReportSenderType;
  },
): Promise<SenderLine | null> {
  const line = await store.findActiveLine(input.integrationId, input.type);
  if (!line) {
    return null;
  }
  const usable = await store.senderUsable(
    input.tenantId,
    line.id,
    input.userId,
  );
  return usable ? line : null;
}

/** A text setting of a line (instance_id, country_code), if present. */
export function lineSetting(settings: Json | null, key: string): string | null {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return null;
  }
  const value = settings[key];
  if (typeof value === "number") {
    return String(value);
  }
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Whether a line has the token and instance it needs to send. */
export function lineIsReady(line: SenderLine): boolean {
  return !!line.api_key && !!lineSetting(line.settings, "instance_id");
}

/** The named line when the tenant owns it or was shared it, whoever sends. */
async function loadTenantLine(
  store: LineStore,
  input: { tenantId: string; integrationId: string; type: ReportSenderType },
): Promise<SenderLine | null> {
  const line = await store.findActiveLine(input.integrationId, input.type);
  if (!line) {
    return null;
  }
  return (await store.tenantCanUse(input.tenantId, line.id)) ? line : null;
}
