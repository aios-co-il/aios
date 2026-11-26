// Which image addresses a model's reply may load on its own. An image is
// fetched the moment it renders, so an address the reply text names can carry
// data out with no click (AIO-665). Pure: no browser or Vite globals.

/** The addresses this environment is configured with. */
export interface AiosAddressConfig {
  /** `VITE_SUPABASE_URL`: the Supabase API address the app talks to. */
  supabaseUrl?: string;
  /** `VITE_SUPABASE_PUBLISHABLE_KEY`: names the project behind a custom domain. */
  publishableKey?: string;
  /** The origin the app itself is served from. */
  appOrigin?: string;
}

/** Storage is the only part of the Supabase API that serves pictures. */
const STORAGE_PATH = "/storage/v1/";

/**
 * Whether AIOS itself serves this address: the app's own origin, or the
 * storage of this environment's Supabase project (public and signed links).
 */
export function isAiosImageAddress(
  address: string,
  config: AiosAddressConfig,
): boolean {
  const appOrigin = originOf(config.appOrigin);
  const target = parseUrl(address, appOrigin ?? undefined);
  if (!target) {
    return false;
  }

  return (
    target.origin === appOrigin ||
    (target.pathname.startsWith(STORAGE_PATH) &&
      supabaseOrigins(config).includes(target.origin))
  );
}

/**
 * The origins of this environment's Supabase project: the configured address
 * and the project's own supabase.co address. Edge functions write storage
 * links on the supabase.co address even where the app uses a custom domain
 * (docs/ENVIRONMENTS.md § Public API address).
 */
function supabaseOrigins(config: AiosAddressConfig): Array<string> {
  const projectRef = projectRefOf(config.publishableKey);
  const candidates = [
    originOf(config.supabaseUrl),
    projectRef ? `https://${projectRef}.supabase.co` : null,
  ];

  return candidates.filter((origin) => origin !== null);
}

/** The project ref a Supabase JWT key carries, or null for any other key. */
function projectRefOf(key: string | undefined): string | null {
  const payload = (key ?? "").split(".")[1];
  if (!payload) {
    return null;
  }

  try {
    const claims: unknown = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    );
    const ref =
      typeof claims === "object" && claims !== null && "ref" in claims
        ? claims.ref
        : null;

    return typeof ref === "string" && /^[a-z0-9]+$/.test(ref) ? ref : null;
  } catch {
    // Not a JWT (for example an sb_publishable_ key): no project ref to read.
    return null;
  }
}

/** The origin of an http(s) address, or null when it is not one. */
function originOf(value: string | undefined): string | null {
  const url = value ? parseUrl(value) : null;

  return url && /^https?:$/.test(url.protocol) ? url.origin : null;
}

/** The parsed URL, or null when it is not one. */
function parseUrl(value: string, base?: string): URL | null {
  try {
    return new URL(value, base);
  } catch {
    return null;
  }
}
