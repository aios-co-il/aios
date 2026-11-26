/**
 * Whether the device asks the user before a step. The name differs from `approvalRiskClass`
 * on purpose: that one decides who may approve a queued action, this one decides whether
 * the extension draws a card. The server and the panel both call it; the panel's answer,
 * from the tab's real address at the moment of acting, is the one that counts.
 */
import { actNeverCategory } from "./act-never-hosts.ts";
import { DEVICE_TOOLS, type DeviceToolName } from "./contract.ts";
import {
  type EnvironmentOrigins,
  isNeverControllable,
  webHostname,
} from "./never-controllable.ts";

/** `never`: refused, nobody is asked. `ask`: a card, every time. `free`: runs without a card. */
export type DeviceCardRule = "never" | "ask" | "free";

export type DeviceStep = {
  tool: DeviceToolName;
  /** Where the step lands: a navigation's destination, otherwise the tab's real address. */
  url: string;
  /** The user marked this address's exact origin trusted for this conversation, from a card. */
  trusted: boolean;
  /** The run holds a page result from another origin (`holdsAnotherOrigin`), so page text from elsewhere may be steering it. */
  tainted: boolean;
  origins: EnvironmentOrigins;
  /** Hosts the tenant added to the act floor. */
  addedActNeverHosts?: ReadonlyArray<string>;
  /** The page has a password or payment field. The page reports it, so it can only bring the card back. */
  sensitivePage?: boolean;
};

/**
 * The rule for one step. Nothing a page writes (roles, names, field types) is an input
 * that can move the answer towards `free`.
 */
export function deviceCardRule(step: DeviceStep): DeviceCardRule {
  if (isNeverControllable(step.url, step.origins)) {
    return "never";
  }
  if (DEVICE_TOOLS[step.tool].risk === "read") {
    return "free";
  }
  if (actNeverCategory(hostnameOf(step.url), step.addedActNeverHosts)) {
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

/** What the page says about a field. All of it is written by the page, so it is best effort. */
export type FieldFacts = {
  /** The `type` attribute of an input. */
  type?: string | null;
  autocomplete?: string | null;
  /** Any text that names the field: its name, id, label and placeholder. */
  names?: ReadonlyArray<string | null | undefined>;
};

export type FieldNeverReason = "file" | "password" | "card" | "one_time_code";

/**
 * Why Carmen never types into this field, or null. Any one hint refuses and none can
 * allow: a field named "comment" with `type="password"` is still a password field.
 */
export function fieldNeverReason(facts: FieldFacts): FieldNeverReason | null {
  const type = (facts.type ?? "").trim().toLowerCase();
  const autocomplete = (facts.autocomplete ?? "").toLowerCase().split(/\s+/);
  const names = (facts.names ?? []).join(" ").toLowerCase();

  if (type === "file") {
    return "file";
  }
  if (
    type === "password" ||
    autocomplete.some((token) => token.endsWith("-password")) ||
    PASSWORD_NAME.test(names)
  ) {
    return "password";
  }
  if (
    autocomplete.some((token) => token.startsWith("cc-")) ||
    CARD_NAME.test(names)
  ) {
    return "card";
  }

  return autocomplete.includes("one-time-code") || CODE_NAME.test(names)
    ? "one_time_code"
    : null;
}

const PASSWORD_NAME = /passw|passcode|pwd|סיסמ/;
const CARD_NAME =
  /(?:card|cc)[-_ ]?(?:number|num|no|exp|cvc|cvv|csc)|credit[-_ ]?card|cvv|cvc|אשראי/;
const CODE_NAME =
  /otp|totp|2fa|mfa|one[-_ ]?time|verification[-_ ]?code|קוד אימות/;

/** The host of an address already known to be a web page. */
function hostnameOf(url: string): string {
  return webHostname(new URL(url));
}
