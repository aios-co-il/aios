/**
 * A landing site's custom domain (for example lp.exsitu.co.il), set in AIOS and written into the
 * site's site.json as "domains", which the landing-pages app serves the site on. The format check
 * matches the landing_sites column checks (20261120100000_landing_site_domain.sql), and the
 * settings panel imports it from here, as it imports the landing-domain function's answer.
 */

/** The root domain every client's landing site is served under, as <subdomain>.aios.co.il. */
export const LANDING_ROOT_DOMAIN = "aios.co.il";

/** A lowercase hostname of two labels or more: no scheme, path, port or trailing dot. */
const HOSTNAME =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;
const MAX_HOSTNAME_LENGTH = 253;

/** A DNS record the client adds at their domain's provider, with its name relative to the zone. */
export interface DnsRecord {
  type: "A" | "CNAME" | "TXT";
  name: string;
  value: string;
}

/** What the landing-domain edge function answers for a site's domain. */
export type LandingDomainResult =
  | {
      /** False outside Production, where the function never calls Vercel. */
      available: false;
      message: string;
    }
  | {
      available: true;
      /** The site's saved domain; null when it has none. */
      domain: string | null;
      /** The domain is attached to the landing-pages Vercel project. */
      connected: boolean;
      /** Vercel verified the domain and its DNS points at Vercel: the site is served on it. */
      verified: boolean;
      /** The records the client adds; empty once the domain is verified or when there is none. */
      records: Array<DnsRecord>;
    };

/** The hostname as stored: trimmed and lowercased; empty for no domain. */
export function normalizeDomain(input: string): string {
  return input.trim().toLowerCase();
}

/** Why a domain cannot be saved, in Hebrew; null when it can (an empty one clears the domain). */
export function customDomainProblem(input: string): string | null {
  const domain = normalizeDomain(input);
  if (!domain) {
    return null;
  }
  if (
    domain === LANDING_ROOT_DOMAIN ||
    domain.endsWith(`.${LANDING_ROOT_DOMAIN}`)
  ) {
    return `כתובות של ${LANDING_ROOT_DOMAIN} ניתנות דרך תת־הדומיין של האתר. כאן מזינים דומיין של הלקוח`;
  }
  if (domain.length > MAX_HOSTNAME_LENGTH || !HOSTNAME.test(domain)) {
    return "הדומיין לא תקין: רק שם מארח, למשל lp.example.co.il, בלי https://, נתיב או פורט";
  }
  return null;
}

/**
 * The site.json with only its domains replaced, or null when the repository already holds that
 * domain. Every other key stays as it is, in its place; no domain drops the key.
 */
export function siteWithDomain(
  site: Record<string, unknown>,
  domain: string | null,
): Record<string, unknown> | null {
  const wanted = domain ? [normalizeDomain(domain)] : [];
  const current = Array.isArray(site.domains) ? site.domains : [];
  if (JSON.stringify(current) === JSON.stringify(wanted)) {
    return null;
  }
  if (wanted.length > 0) {
    return { ...site, domains: wanted };
  }
  return Object.fromEntries(
    Object.entries(site).filter(([key]) => key !== "domains"),
  );
}

/** The domain a build serves the site on, for its digest; empty when the site has none. */
export function domainFingerprint(domain: string | null): string {
  return domain ? `domains:${normalizeDomain(domain)}` : "";
}
