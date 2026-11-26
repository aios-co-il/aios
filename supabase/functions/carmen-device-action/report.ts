/**
 * What a panel says when it completes an action: how the step ended, the card rule it
 * applied, the tab's address as it saw it, and the tool's result. All of it is the panel's
 * own word; the server never witnesses the tap.
 */
import {
  DEVICE_CARD_RULES,
  type DeviceCardRule,
} from "../_shared/carmen/device/card-rule.ts";
import type { DeviceActionStatus } from "../_shared/carmen/device/contract.ts";
import type { PageLocation } from "../_shared/carmen/device/results.ts";
import { pageLocation } from "../_shared/carmen/device-result-check.ts";

/**
 * The statuses a panel may report. `pending` and `claimed` are written by the server and
 * by the claim, and `outcome_unknown` means no panel reported at all, so none of the three
 * can arrive from a panel.
 */
export const PANEL_STATUSES = [
  "done",
  "refused",
  "denied",
  "target_changed",
  "expired",
  "cancelled",
] as const satisfies ReadonlyArray<DeviceActionStatus>;

export type PanelStatus = (typeof PANEL_STATUSES)[number];

/**
 * A step runs only free or after a card, a user declines only a card, and a refused step
 * asked nobody: the never-list, the act floor, a field rule and a picture of a sensitive
 * page without the permission all report `never`. With the permission that picture is a
 * card (`ask`), so it ends `done` or `denied` like any other card.
 */
const RULES_BY_STATUS: Partial<
  Record<PanelStatus, ReadonlyArray<DeviceCardRule>>
> = { done: ["ask", "free"], denied: ["ask"], refused: ["never"] };

export type ActionReport = {
  status: PanelStatus;
  decision: DeviceCardRule | null;
  observed: PageLocation | null;
  /** Unread until the action's tool is known (`toolResult`); null unless the step is done. */
  result: unknown;
  /**
   * The origin the user ticked "trust this site for this conversation" for on the step's
   * card, or null. Only a done step that ran after a card carries one, and only for the
   * https origin where the tab is after it.
   */
  trust_origin: string | null;
};

/** The report, or null when any part of it is not one a panel may send. */
export function parseReport(
  input: Record<string, unknown>,
): ActionReport | null {
  const status = PANEL_STATUSES.find((known) => known === input.status);
  const decision = DEVICE_CARD_RULES.find((rule) => rule === input.decision);
  const observed = pageLocation(input.observed);
  if (
    !status ||
    (input.decision != null && !decision) ||
    (input.observed != null && !observed)
  ) {
    return null;
  }

  const allowedRules = RULES_BY_STATUS[status];
  if (allowedRules && !(decision && allowedRules.includes(decision))) {
    return null;
  }

  // A done step says where it ran and what it got; any other step has no result.
  const hasResult = input.result != null;
  if (status === "done" ? !(observed && hasResult) : hasResult) {
    return null;
  }

  const trustOrigin = reportedTrust(
    input.trust_origin,
    status,
    decision,
    observed,
  );
  if (trustOrigin === undefined) {
    return null;
  }

  return {
    status,
    decision: decision ?? null,
    observed,
    result: input.result ?? null,
    trust_origin: trustOrigin,
  };
}

/**
 * The trusted origin a report carries: null when it carries none, undefined when it may
 * not carry this one. A trust comes only from a card the user tapped (`done` after `ask`),
 * for the https origin the tab is on after the step: a step that left the site trusts
 * nothing, and an http page, which the panel never acts on, is never trusted.
 */
function reportedTrust(
  value: unknown,
  status: PanelStatus,
  decision: DeviceCardRule | undefined,
  observed: PageLocation | null,
): string | null | undefined {
  if (value == null) {
    return null;
  }
  const ranAfterCard = status === "done" && decision === "ask";

  return ranAfterCard &&
    observed?.origin === value &&
    observed.origin.startsWith("https://")
    ? observed.origin
    : undefined;
}
