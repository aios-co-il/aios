/**
 * Whether the device asks the user before a step. The name differs from `approvalRiskClass`
 * on purpose: that one decides who may approve a queued action, this one decides whether
 * the extension draws a card. The server and the panel both call it; the panel's answer,
 * from the tab's real address at the moment of acting, is the one that counts.
 */
import { isActNeverHost } from "./act-never-hosts.ts";
import {
  DEVICE_TOOLS,
  type DeviceToolName,
  isDeviceToolName,
} from "./contract.ts";
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

/**
 * One step to rule on. Every flag is required and read strictly: a value that is not a
 * real boolean (missing, null, a string) counts as the tighter answer, because CI does not
 * type-check the edge code that builds a step.
 */
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
   * only tighten: it brings the card back and puts a picture behind the permission below.
   * Required, so a caller that has not looked cannot pass for one that found nothing.
   */
  sensitivePage: boolean;
  /**
   * The user holds the permission to take a picture of a page on the act floor or of a
   * sensitive page. The organization's manager switches it on per user in Carmen's
   * permissions screen; it is off by default. The switch and its storage arrive with the
   * screenshot pull request (AIO-656); every caller until then passes `false`.
   */
  sensitiveScreenshotsAllowed: boolean;
};

/**
 * The rule for one step. Nothing a page writes (roles, names, field types) is an input
 * that can move the answer towards `free`. Throws when the tool is not a device tool, or a
 * configured origin or a tenant entry names no host; the caller refuses the step.
 */
export function deviceCardRule(step: DeviceStep): DeviceCardRule {
  // An inherited key (`toString`) would read as a tool with no risk, and so as an act tool.
  if (!isDeviceToolName(step.tool)) {
    throw new TypeError(`Not a device tool: ${JSON.stringify(step.tool)}`);
  }
  if (isNeverControllable(step.url, step.origins)) {
    return "never";
  }
  const onActFloor = isActNeverHost(step.url, step.addedActNeverHosts);
  const sensitivePage = step.sensitivePage !== false;

  // A picture goes to an outside vision model. Where the pixels would show mail, messages,
  // money or a secret being typed, it is refused unless the manager gave this user the
  // permission, and then the user is asked every time: trust in a site covers clicks on
  // it, never what leaves it.
  if (step.tool === "browser_screenshot") {
    if (!onActFloor && !sensitivePage) {
      return "free";
    }
    return step.sensitiveScreenshotsAllowed === true ? "ask" : "never";
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

  return step.trusted === true && step.tainted === false && !sensitivePage
    ? "free"
    : "ask";
}

/** Whether any page result of a run came from an origin other than this address's: the `tainted` input. */
export function holdsAnotherOrigin(
  url: string,
  resultOrigins: ReadonlyArray<string>,
): boolean {
  const origin = URL.canParse(url) ? new URL(url).origin : null;

  return resultOrigins.some((resultOrigin) => resultOrigin !== origin);
}
