/**
 * Whether the panel may move the tab for a claimed `browser_navigate`, and whether the page
 * it landed on may be reported. Decided from the tab's raw `chrome.tabs` address and the
 * destination in the claimed row, with the contract's own checks: the destination is read
 * by `navigateDestination` as the server read it, and both pages are ruled on by
 * `deviceCardRule`, which asks for every navigation and refuses the never-list and the act
 * floor.
 */
import { deviceCardRule } from "../../../supabase/functions/_shared/carmen/device/card-rule.ts";
import { navigateDestination } from "../../../supabase/functions/_shared/carmen/device/navigate-destination.ts";
import type { EnvironmentOrigins } from "../../../supabase/functions/_shared/carmen/device/never-controllable.ts";
import type { PageLocation } from "../../../supabase/functions/_shared/carmen/device/results.ts";
import { pageLocation } from "../../../supabase/functions/_shared/carmen/device-result-check.ts";

/** Why the panel refuses a navigation, or the page it landed on; logged, reported as `refused`/`never`. */
export type NavigateRefusal =
  /** The claimed arguments are not one http or https address. */
  | "invalid_destination"
  /** Chrome gave no address for the tab. */
  | "address_unknown"
  /** The never-list or the act floor, for the tab or the destination. */
  | "never"
  /** The contract threw on this environment's configured origins. */
  | "configuration"
  /** A path the server would refuse (`//…` or over its limit). */
  | "path_not_reportable";

export type NavigateStep =
  | { kind: "refuse"; reason: NavigateRefusal }
  | {
      kind: "navigate";
      /** Where the tab is now, as a denied or stopped step reports it. */
      from: PageLocation;
      /** The host the card names as the tab's current site. */
      fromHost: string;
      /** The destination exactly as Chrome will be asked to open it. */
      destination: string;
      /** The destination's host, as the card names it. */
      host: string;
    };

/** The navigation decision for the tab's raw address and the claimed arguments. */
export function decideNavigateStep(
  tabUrl: string | undefined,
  args: unknown,
  origins: EnvironmentOrigins,
): NavigateStep {
  const destination = navigateDestination(args);
  if (!destination) {
    return refuse("invalid_destination");
  }
  const from = actionablePage(tabUrl, origins);
  if ("reason" in from) {
    return refuse(from.reason);
  }
  const rule = navigateRule(destination, origins);
  if (rule !== "ask") {
    return refuse(rule);
  }

  return {
    kind: "navigate",
    from: from.location,
    fromHost: from.host,
    destination,
    host: new URL(destination).hostname,
  };
}

/**
 * Where the tab landed, when the page may be reported: the contract would let a navigation
 * act on it. A redirect to the never-list or the act floor is a refusal, so nothing of
 * that page is reported.
 */
export function landedPage(
  tabUrl: string | undefined,
  origins: EnvironmentOrigins,
): PageLocation | NavigateRefusal {
  const landed = actionablePage(tabUrl, origins);

  return "reason" in landed ? landed.reason : landed.location;
}

/** A page a navigation may act on, with its reportable location and host. */
function actionablePage(
  tabUrl: string | undefined,
  origins: EnvironmentOrigins,
): { location: PageLocation; host: string } | { reason: NavigateRefusal } {
  if (!tabUrl) {
    return { reason: "address_unknown" };
  }
  const rule = navigateRule(tabUrl, origins);
  if (rule !== "ask") {
    return { reason: rule };
  }
  const address = new URL(tabUrl);
  const location = pageLocation({
    origin: address.origin,
    path: address.pathname,
  });

  return location
    ? { location, host: address.hostname }
    : { reason: "path_not_reportable" };
}

/**
 * The contract's rule for a navigation touching this address. The inputs the panel cannot
 * know are passed at their tighter value, as the read does; for a navigation they do not
 * move the answer, which is `ask` unless the page is out of reach.
 */
function navigateRule(
  url: string,
  origins: EnvironmentOrigins,
): "ask" | "never" | "configuration" {
  try {
    const rule = deviceCardRule({
      tool: "browser_navigate",
      url,
      trusted: false,
      tainted: true,
      origins,
      addedActNeverHosts: [],
      sensitivePage: true,
      sensitiveScreenshotsAllowed: false,
    });
    // Every navigation asks; any other answer is not one the panel acts on.
    return rule === "ask" ? "ask" : "never";
  } catch (error) {
    if (error instanceof TypeError) {
      console.error("[carmen-panel] the device contract refused", error);
      return "configuration";
    }
    throw error;
  }
}

/** A refusal for one reason. */
function refuse(reason: NavigateRefusal): NavigateStep {
  return { kind: "refuse", reason };
}
