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

/** Every Supabase project is served at `<ref>` plus this. */
const PROJECT_HOST_SUFFIX = ".supabase.co";

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
 * and the project's own address. Edge functions write storage links on the
 * project's own address even where the app uses a custom domain
 * (docs/ENVIRONMENTS.md § Public API address).
 */
function supabaseOrigins(config: AiosAddressConfig): Array<string> {
  const candidates = [originOf(config.supabaseUrl), projectOriginOf(config)];

  return candidates.filter((origin) => origin !== null);
}

/**
 * The project's own supabase.co origin: the configured address when the app
 * talks to it directly, else the project the publishable key names. Null when
 * neither says, and then pictures stored on that address cannot be shown.
 */
export function projectOriginOf(config: AiosAddressConfig): string | null {
  const configured = originOf(config.supabaseUrl);
  if (configured?.endsWith(PROJECT_HOST_SUFFIX)) {
    return configured;
  }

  const projectRef = projectRefOf(config.publishableKey);

  return projectRef ? `https://${projectRef}${PROJECT_HOST_SUFFIX}` : null;
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

    return typeof ref === "string" ? ref : null;
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
