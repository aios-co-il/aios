/**
 * What the chat collector runs for a tenant: the kinds it has not turned
 * off, and how far back it reads.
 */
import type { FindingKind } from "../../../_shared/manager-round/kinds.ts";
import {
  kindMode,
  kindNotifySince,
} from "../../../_shared/manager-round/modes.ts";
import type { ManagerSettings } from "../../../_shared/manager-round/settings.ts";
import type { CollectorContext } from "../types.ts";

export const CHAT_KINDS: readonly FindingKind[] = [
  "unanswered_request",
  "client_complaint",
  "unlinked_group",
];

/** The kinds read from client threads (unlinked_group reads group names only). */
export const THREAD_KINDS: readonly FindingKind[] = [
  "unanswered_request",
  "client_complaint",
];

/** How far back every read goes; the SQL reads take it as their p_since. */
const WINDOW_DAYS = 7;

/** The collector's kinds the tenant has not turned off. */
export function enabledKinds(settings: ManagerSettings): FindingKind[] {
  return CHAT_KINDS.filter((kind) => kindMode(settings, kind) !== "off");
}

/**
 * Where the read starts: WINDOW_DAYS back, or later when every given kind
 * sends and started sending later (its notify_since; nothing before it is
 * ever raised). A kind that only observes has no stamp and reads the window.
 */
export function readSince(
  ctx: Pick<CollectorContext, "settings" | "now">,
  kinds: readonly FindingKind[],
): Date {
  const floor = ctx.now.getTime() - WINDOW_DAYS * 86_400_000;
  const starts = kinds.map((kind) => {
    const since = kindNotifySince(ctx.settings, kind);
    return since ? Math.max(floor, Date.parse(since)) : floor;
  });
  return new Date(starts.length ? Math.min(...starts) : floor);
}
