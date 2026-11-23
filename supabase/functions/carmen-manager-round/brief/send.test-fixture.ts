/** The morning brief's run for send.test.ts: David as the recipient, in the 08:00 slot. */
import { resolveManagerSettings } from "../../_shared/manager-round/settings.ts";
import { RoundBudget } from "../budget.ts";
import type { Recipient } from "../findings/types.ts";
import { deps } from "../tests/fakes.ts";
import { TENANT, type World } from "../tests/fake-world.ts";
import { sendBriefIfDue } from "./send.ts";

export const david: Recipient = {
  key: "user:david",
  user_id: "david",
  name: "דוד",
  phone: "972503333333",
  role: "owner",
};
export const SINCE = "2026-10-01T00:00:00Z";
// Sunday 08:07 Israel time.
export const SLOT_TIME = new Date("2026-11-01T06:07:00Z");

/** sendBriefIfDue for David over `w` with these manager settings; `fields` override the run. */
export function brief(
  w: World,
  manager: Record<string, unknown>,
  fields: {
    dryRun?: boolean;
    recipients?: Array<Recipient>;
    budget?: RoundBudget;
    ports?: ReturnType<typeof deps>;
    settingsChanged?: () => boolean;
  } = {},
) {
  return sendBriefIfDue(fields.ports ?? deps(w), {
    tenantId: TENANT,
    settings: resolveManagerSettings({ manager }),
    now: w.now,
    recipients: () => Promise.resolve(fields.recipients ?? [david]),
    state: w.state,
    floors: {},
    budget: fields.budget ?? RoundBudget.create(140_000, 0),
    settingsChanged: () => Promise.resolve(fields.settingsChanged?.() ?? false),
    dryRun: fields.dryRun ?? false,
  });
}
