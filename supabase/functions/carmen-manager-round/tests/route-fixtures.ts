/** People, clock and settings shared by the router tests. */
import { resolveManagerSettings } from "../../_shared/manager-round/settings.ts";
import type { Recipient, RouteDecision } from "../findings/types.ts";
import type { RouteContext } from "../router/route.ts";

export const dana: Recipient = {
  key: "user:dana",
  user_id: "dana",
  name: "דנה כהן",
  phone: "972501111111",
  role: "campaigner",
};
export const avi: Recipient = {
  key: "user:avi",
  user_id: "avi",
  name: "אבי לוי",
  phone: "972502222222",
  role: "manager",
};
export const david: Recipient = {
  key: "user:david",
  user_id: "david",
  name: "דוד",
  phone: "972503333333",
  role: "owner",
};
export const client = { id: "c1", agency_id: "a1", name: "לקוח א" };
export const SINCE = "2026-10-31T00:00:00Z";
// Sunday 2026-11-01 10:00 Israel time (UTC+2).
export const SUNDAY_10 = "2026-11-01T08:00:00Z";

/** A route context at Sunday 10:00 for `client`, with Dana, Avi and David; `fields` override any part. */
export function ctx(
  manager: Record<string, unknown>,
  fields: Partial<RouteContext> = {},
): RouteContext {
  return {
    now: new Date(SUNDAY_10),
    settings: resolveManagerSettings({ manager }),
    people: { client, campaigners: [dana], managers: [avi] },
    brief: [david],
    floors: {},
    ...fields,
  };
}

export const team = { mode: "team", notify_since: SINCE };
/** Each planned delivery as `level:recipient:slot:not_before`. */
export const keys = (decision: RouteDecision) =>
  decision.deliveries.map(
    (d) => `${d.level}:${d.recipient_key}:${d.slot}:${d.not_before}`,
  );
