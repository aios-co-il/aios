/**
 * The pages Carmen never reads or acts on, whoever asks: anything that is not a web page,
 * AIOS itself, the services AIOS is run from and the places a user signs in. The server
 * checks a navigation's destination and the address a panel reports; the panel checks the
 * tab's real address again when it acts. Pure, so all three use the same function.
 */
import { isSupabaseApiHost } from "../../public-api/hosts.ts";
import { WEB_PROTOCOLS } from "../screen-context.ts";
import { isAppHost } from "../skin-gallery.ts";

/** This environment's own addresses, from its configuration; the patterns below cover the rest. */
export type EnvironmentOrigins = {
  /** The web app: the environment's Auth `site_url`. */
  appOrigins: ReadonlyArray<string>;
  /** Every address of the environment's Supabase project. */
  backendOrigins: ReadonlyArray<string>;
};

/** Why a page is out of reach; the model and the logs get the reason, never a way round it. */
export type NeverControllableReason =
  | "not_a_web_page"
  | "credentials_in_address"
  | "extension_store"
  | "aios_app"
  | "aios_backend"
  | "operations_console"
  | "sign_in";

/** Chrome's extension stores: Chrome refuses scripts there, and a page there can change this extension. */
const EXTENSION_STORE_HOSTS = [
  "chromewebstore.google.com",
  "chrome.google.com",
];

/** Where AIOS is deployed and its database is managed: an action there could change AIOS for every org. */
const OPERATIONS_CONSOLE_HOSTS = ["supabase.com", "vercel.com"];

/** Google's sign-in pages, where a click can grant another party access to the account. */
const SIGN_IN_HOSTS = ["accounts.google.com"];

/**
 * Why this address is never controllable, or null when it is an ordinary web page. Throws
 * when a configured origin is not an address: see `hostnamesOf`.
 */
export function neverControllableReason(
  url: string,
  origins: EnvironmentOrigins,
): NeverControllableReason | null {
  const environment = {
    app: hostnamesOf(origins.appOrigins),
    backend: hostnamesOf(origins.backendOrigins),
  };
  const address = parseWebAddress(url);

  if (!address) {
    return "not_a_web_page";
  }
  // `https://aios.co.il@evil.example/` shows one site and opens another.
  if (address.username || address.password) {
    return "credentials_in_address";
  }

  return hostReason(webHostname(address), environment);
}

/** Whether no device tool may touch this address. */
export function isNeverControllable(
  url: string,
  origins: EnvironmentOrigins,
): boolean {
  return neverControllableReason(url, origins) !== null;
}

/** The address when it is an http or https page, otherwise null. */
export function parseWebAddress(url: string): URL | null {
  const address = URL.canParse(url) ? new URL(url) : null;

  return address && WEB_PROTOCOLS.includes(address.protocol) ? address : null;
}

/**
 * The host as rules compare it. URL parsing already lower-cased it, turned an
 * internationalised name into punycode and an odd IP spelling into the usual one; the
 * trailing dot of a fully qualified name is the one thing left that names the same site
 * under another spelling.
 */
export function webHostname(address: URL): string {
  return address.hostname.replace(/\.+$/, "");
}

/**
 * Whether a host is one of the domains or a subdomain of one. Whole labels only, so
 * `notexample.com` and `example.com.evil.test` are not within `example.com`.
 */
export function isHostWithinAny(
  hostname: string,
  domains: ReadonlyArray<string>,
): boolean {
  return domains.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
}

/** The hosts of this environment's configured origins. */
type EnvironmentHosts = { app: Set<string>; backend: Set<string> };

/** The first never-rule a host falls under. */
function hostReason(
  hostname: string,
  environment: EnvironmentHosts,
): NeverControllableReason | null {
  // Before the app rule: api.aios.co.il is a subdomain of the app's domain and is the backend.
  if (isSupabaseApiHost(hostname) || environment.backend.has(hostname)) {
    return "aios_backend";
  }
  if (isAppHost(hostname) || environment.app.has(hostname)) {
    return "aios_app";
  }
  if (isHostWithinAny(hostname, EXTENSION_STORE_HOSTS)) {
    return "extension_store";
  }
  if (isHostWithinAny(hostname, OPERATIONS_CONSOLE_HOSTS)) {
    return "operations_console";
  }

  return isHostWithinAny(hostname, SIGN_IN_HOSTS) ? "sign_in" : null;
}

/**
 * The hosts of configured origins. Compared by host, not by origin, so the same site on
 * another port or over http is covered too. A value with no host (empty, or a host written
 * without `https://`) throws: ignoring it would leave that address controllable with no
 * signal, so a misconfigured environment refuses every step until it is fixed.
 */
function hostnamesOf(origins: ReadonlyArray<string>): Set<string> {
  return new Set(origins.map(configuredHostname));
}

/** The host of one configured origin. */
function configuredHostname(origin: string): string {
  const hostname = URL.canParse(origin) ? webHostname(new URL(origin)) : "";

  if (!hostname) {
    throw new TypeError(
      `Configured origin is not an address: ${JSON.stringify(origin)}`,
    );
  }
  return hostname;
}
