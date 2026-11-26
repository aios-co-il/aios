/**
 * Whether the panel may read the tab for a claimed `browser_read_page`, decided from the
 * tab's real address as Chrome reports it at that moment: never an address from the
 * framed site's message or from the page. The contract's rule decides; the panel only
 * adds what it needs to report and to ask Chrome for the site.
 */
import { deviceCardRule } from "../../../supabase/functions/_shared/carmen/device/card-rule.ts";
import type { EnvironmentOrigins } from "../../../supabase/functions/_shared/carmen/device/never-controllable.ts";
import type { PageLocation } from "../../../supabase/functions/_shared/carmen/device/results.ts";
import { pageLocation } from "../../../supabase/functions/carmen-device-action/result.ts";
import { sitePattern } from "./siteGrant.ts";

/** Why the panel refuses a read; logged, and reported as `refused` with the rule `never`. */
export type ReadRefusal =
  /** Chrome gave no address: no tab, or tab sharing is off. */
  | "address_unknown"
  /** The contract's never-list: AIOS, its backend, sign-in, the stores, not a web page. */
  | "never_controllable"
  /** The contract threw on this environment's configured origins. */
  | "configuration"
  /** An http page: the panel is never granted one, so it cannot read it. */
  | "not_https"
  /** A path the server would refuse (`//…` or over its limit); never rewritten. */
  | "path_not_reportable";

export type ReadStep =
  | { kind: "refuse"; reason: ReadRefusal }
  | {
      kind: "read";
      /** Where the page is, as the row reports it. */
      location: PageLocation;
      /** The host the card names: punycode, as Chrome's own prompt shows it. */
      host: string;
      /** What Chrome is asked for when the site is not granted. */
      pattern: string;
      /** The contract's rule: `ask` shows the card even when the site is granted. */
      rule: "ask" | "free";
    };

/** The read decision for the tab's raw `chrome.tabs` address. */
export function decideReadStep(
  tabUrl: string | undefined,
  origins: EnvironmentOrigins,
): ReadStep {
  if (!tabUrl) {
    return refuse("address_unknown");
  }
  const rule = readRule(tabUrl, origins);
  if (rule === "configuration" || rule === "never") {
    return refuse(rule === "never" ? "never_controllable" : rule);
  }

  const address = new URL(tabUrl);
  if (address.protocol !== "https:") {
    return refuse("not_https");
  }
  const location = pageLocation({
    origin: address.origin,
    path: address.pathname,
  });
  if (!location) {
    return refuse("path_not_reportable");
  }

  return {
    kind: "read",
    location,
    host: address.host,
    pattern: sitePattern(address.hostname),
    rule,
  };
}

/**
 * The contract's rule for reading this address. Every input the panel cannot know is
 * passed at its tighter value: no trusted mode yet, the run may hold another origin's
 * text, the page may hold a sensitive field, no tenant floor, no picture permission.
 * A TypeError is the contract refusing a misconfigured environment.
 */
function readRule(
  url: string,
  origins: EnvironmentOrigins,
): "never" | "ask" | "free" | "configuration" {
  try {
    return deviceCardRule({
      tool: "browser_read_page",
      url,
      trusted: false,
      tainted: true,
      origins,
      addedActNeverHosts: [],
      sensitivePage: true,
      sensitiveScreenshotsAllowed: false,
    });
  } catch (error) {
    if (error instanceof TypeError) {
      console.error("[carmen-panel] the device contract refused", error);
      return "configuration";
    }
    throw error;
  }
}

/** A refusal for one reason. */
function refuse(reason: ReadRefusal): ReadStep {
  return { kind: "refuse", reason };
}
