/**
 * Whether the device asks the user before a step. The name differs from `approvalRiskClass`
 * on purpose: that one decides who may approve a queued action, this one decides whether
 * the extension draws a card. The server and the panel both call it; the panel's answer,
 * from the tab's real address at the moment of acting, is the one that counts.
 */
import { isActNeverHost } from "./act-never-hosts.ts";
import { DEVICE_TOOLS, type DeviceToolName } from "./contract.ts";
import {
  type EnvironmentOrigins,
  isNeverControllable,
} from "./never-controllable.ts";

/**
 * `never`: refused, nobody is asked. `ask`: a card, every time. `free`: runs without a card.
 * The action row's `decision` check lists the same values; `table-lists.test.ts` fails when they differ.
 */
export const DEVICE_CARD_RULES = ["never", "ask", "free"] as const;
export type DeviceCardRule = (typeof DEVICE_CARD_RULES)[number];

export type DeviceStep = {
  tool: DeviceToolName;
  /** Where the step lands: a navigation's destination, otherwise the tab's real address. */
  url: string;
  /** The user marked this address's exact origin trusted for this conversation, from a card. */
  trusted: boolean;
  /** The run holds a page result from another origin (`holdsAnotherOrigin`), so page text from elsewhere may be steering it. */
  tainted: boolean;
  origins: EnvironmentOrigins;
  /** Hosts the tenant added to the act floor; `[]` when the setting is empty. Required, so a caller cannot forget it. */
  addedActNeverHosts: ReadonlyArray<string>;
  /**
   * The page the tab shows has a password or payment field. The page reports it, so it can
   * only tighten: it brings the card back and refuses a picture. Required, so a caller that
   * has not looked cannot pass for one that found nothing.
   */
  sensitivePage: boolean;
};

/**
 * The rule for one step. Nothing a page writes (roles, names, field types) is an input
 * that can move the answer towards `free`. Throws when a configured origin or a tenant
 * entry names no host; the caller refuses the step.
 */
export function deviceCardRule(step: DeviceStep): DeviceCardRule {
  if (isNeverControllable(step.url, step.origins)) {
    return "never";
  }
  const onActFloor = isActNeverHost(step.url, step.addedActNeverHosts);

  // A picture goes to an outside vision model, so it is refused wherever the pixels would
  // show mail, messages, money or a secret being typed. Nobody is asked: a card cannot
  // show the user what the picture will hold.
  if (step.tool === "browser_screenshot") {
    return onActFloor || step.sensitivePage ? "never" : "free";
  }
  if (DEVICE_TOOLS[step.tool].risk === "read") {
    return "free";
  }
  if (onActFloor) {
    return "never";
  }
  // Trust is given to one origin; a navigation may leave it, so it always asks.
  if (step.tool === "browser_navigate") {
    return "ask";
  }

  return step.trusted && !step.tainted && !step.sensitivePage ? "free" : "ask";
}

/** Whether any page result of a run came from an origin other than this address's: the `tainted` input. */
export function holdsAnotherOrigin(
  url: string,
  resultOrigins: ReadonlyArray<string>,
): boolean {
  const origin = URL.canParse(url) ? new URL(url).origin : null;

  return resultOrigins.some((resultOrigin) => resultOrigin !== origin);
}
