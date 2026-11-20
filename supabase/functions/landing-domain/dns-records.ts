/**
 * The DNS records the client adds for a custom domain, from Vercel's answers about it: the record
 * that points the domain at Vercel and any ownership challenge.
 */
import type { DnsRecord } from "../_shared/workshop/landing/site-domain.ts";

/** Vercel's documented targets, used when its config answer carries no recommendation. */
const DEFAULT_A = "76.76.21.21";
const DEFAULT_CNAME = "cname.vercel-dns.com";

/**
 * Second-level labels under which a country code registers names (exsitu.co.il), for telling an
 * apex from a subdomain when Vercel does not name the apex.
 */
const SECOND_LEVEL = new Set(["co", "org", "net", "ac", "gov", "com", "muni"]);

/**
 * The records the client adds: the one that points the domain at Vercel (a CNAME for a subdomain,
 * an A record for an apex, with the values Vercel recommends when it gives them), then any TXT
 * record Vercel asks for to prove ownership. Names are relative to the domain's zone.
 */
export function recordsFor(
  domain: string,
  attached: unknown,
  config: unknown,
): Array<DnsRecord> {
  const apex = text(field(attached, "apexName")) || guessApex(domain);
  const routing: DnsRecord =
    domain === apex
      ? { type: "A", name: "@", value: recommendedIPv4(config) ?? DEFAULT_A }
      : {
          type: "CNAME",
          name: relativeName(domain, apex),
          value: recommendedCNAME(config) ?? DEFAULT_CNAME,
        };
  const challenges = list(field(attached, "verification"))
    .filter((entry) => text(field(entry, "type")).toUpperCase() === "TXT")
    .map((entry): DnsRecord => ({
      type: "TXT",
      name: relativeName(text(field(entry, "domain")), apex),
      value: text(field(entry, "value")),
    }))
    .filter((record) => record.name && record.value);
  return [routing, ...challenges];
}

/** The first-ranked IPv4 address in Vercel's config answer. */
function recommendedIPv4(config: unknown): string | undefined {
  const best = bestRanked(field(config, "recommendedIPv4"));
  const values = list(field(best, "value")).map(text).filter(Boolean);
  return values[0];
}

/** The first-ranked CNAME target in Vercel's config answer, without its trailing dot. */
function recommendedCNAME(config: unknown): string | undefined {
  const best = bestRanked(field(config, "recommendedCNAME"));
  return text(field(best, "value")).replace(/\.$/, "") || undefined;
}

/** The entry with the lowest rank. */
function bestRanked(entries: unknown): unknown {
  return list(entries)
    .slice()
    .sort((a, b) => rank(a) - rank(b))[0];
}

/** An entry's rank; unranked entries come last. */
function rank(entry: unknown): number {
  const value = field(entry, "rank");
  return typeof value === "number" ? value : Number.MAX_SAFE_INTEGER;
}

/** The zone a domain belongs to when Vercel does not say: its last two labels, or three under co.il and the like. */
function guessApex(domain: string): string {
  const labels = domain.split(".");
  const tail =
    labels.length > 2 &&
    labels[labels.length - 1].length === 2 &&
    SECOND_LEVEL.has(labels[labels.length - 2])
      ? 3
      : 2;
  return labels.slice(-tail).join(".");
}

/** A hostname relative to its zone, as DNS panels ask for it; "@" for the zone itself. */
function relativeName(hostname: string, apex: string): string {
  if (hostname === apex) {
    return "@";
  }
  return hostname.endsWith(`.${apex}`)
    ? hostname.slice(0, -(apex.length + 1))
    : hostname;
}

/** A field of a JSON object; undefined for anything else. */
export function field(value: unknown, key: string): unknown {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Reflect.get(value, key)
    : undefined;
}

/** A JSON array, or an empty one. */
function list(value: unknown): Array<unknown> {
  return Array.isArray(value) ? value : [];
}

/** A JSON string, or an empty one. */
export function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
