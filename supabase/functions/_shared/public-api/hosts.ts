// Pure host checks for AIOS Supabase API addresses, shared by edge functions,
// the Staging outbound guard and the frontend (no Deno or browser globals).

/** api.aios.co.il (Production) and api-<name>.aios.co.il (Staging and others). */
const AIOS_API_HOST = /^api(?:-[a-z0-9-]+)?\.aios\.co\.il$/;

/** Whether a host serves some AIOS Supabase project's API: a supabase.co host or an api*.aios.co.il custom domain. */
export function isSupabaseApiHost(hostname: string): boolean {
  const host = hostname.toLowerCase();

  return host.endsWith(".supabase.co") || AIOS_API_HOST.test(host);
}

/**
 * Whether a URL is an edge function of an AIOS Supabase project. `ownBaseUrl`
 * is this project's configured API address, accepted even when its host does
 * not follow the naming above.
 */
export function isSupabaseFunctionUrl(url: string, ownBaseUrl = ""): boolean {
  const target = parseUrl(url);
  if (!target || !target.pathname.includes("/functions/v1/")) {
    return false;
  }

  const ownHost = parseUrl(ownBaseUrl)?.hostname;

  return isSupabaseApiHost(target.hostname) || target.hostname === ownHost;
}

/** The parsed URL, or null when it is not one. */
function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
