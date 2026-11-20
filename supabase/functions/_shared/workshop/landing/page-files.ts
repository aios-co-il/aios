/**
 * A landing page as files of the landing-pages app: content.json (the sections and the theme) and
 * page.json (title and status), plus site.json for a client's first page or when the site's
 * tracking ids or custom domain in AIOS differ from the repository's. The app owns these
 * formats (aios-co-il/landing-pages: src/lib/content.ts, page-meta.ts, site-meta.ts) and its
 * check-pages is the final gate.
 */
import type { LandingBlock } from "./page-content.ts";
import type { LandingStyle } from "./page-style.ts";
import { domainFingerprint, siteWithDomain } from "./site-domain.ts";
import {
  type SiteTracking,
  siteWithTracking,
  trackingFingerprint,
} from "./site-tracking.ts";

/** Every call to action on the page scrolls to its lead form. */
const LEAD_FORM = "#lead-form";

export interface LandingSite {
  subdomain: string;
  tenantId: string;
  clientId: string;
  name: string;
  /** The tracking ids set for the site in AIOS. */
  tracking: SiteTracking;
  /** The site's custom domain set in AIOS; null when it has none. */
  customDomain: string | null;
  /** True once Vercel verified the custom domain, so the site is served on it. */
  customDomainVerified: boolean;
}

export interface LandingPageFilesInput {
  site: LandingSite;
  slug: string;
  title: string;
  itemId: string;
  blocks: Array<LandingBlock>;
  style: LandingStyle;
  status: "draft" | "published";
  /**
   * The page.json the repository holds now, for a page that already exists: its title, brief and
   * description stay as they are, and only the status and the date change.
   */
  existingPage: Record<string, unknown> | null;
  today: string;
  /**
   * The site.json the repository holds now; null for the client's first page, whose site folder
   * does not exist yet.
   */
  existingSite: Record<string, unknown> | null;
}

/** The folder of a page inside the repository. */
export function pageFolder(subdomain: string, slug: string): string {
  return `landing-pages/${subdomain}/${slug}`;
}

/** The path of a site's site.json inside the repository. */
export function siteFile(subdomain: string): string {
  return `landing-pages/${subdomain}/site.json`;
}

/** The page's content.json, exactly as it is committed. */
export function contentJson(
  blocks: Array<LandingBlock>,
  style: LandingStyle,
): string {
  return json({
    theme: {
      primaryColor: style.primaryColor,
      dir: "rtl",
      lang: "he",
      hero: style.hero,
      ...(style.accents ? { accents: style.accents } : {}),
    },
    blocks: blocks.map(appBlock),
  });
}

/** The files of one build, by their path in the repository. */
export function landingPageFiles(
  input: LandingPageFilesInput,
): Record<string, string> {
  const folder = pageFolder(input.site.subdomain, input.slug);
  const files: Record<string, string> = {
    [`${folder}/content.json`]: contentJson(input.blocks, input.style),
    [`${folder}/page.json`]: json(
      input.existingPage
        ? {
            ...input.existingPage,
            status: input.status,
            updatedAt: input.today,
          }
        : {
            title: input.title,
            status: input.status,
            brief: { source: `Carmen Workshop: פרויקט ${input.itemId}` },
            createdBy: "carmen",
            createdAt: input.today,
            updatedAt: input.today,
          },
    ),
  };
  const site = siteJson(input);
  if (site !== null) {
    files[siteFile(input.site.subdomain)] = site;
  }
  if (!input.existingSite) {
    files[`landing-pages/${input.site.subdomain}/assets/.gitkeep`] = "";
  }
  return files;
}

/**
 * The site.json this build writes: a new site's, or the existing one with only its tracking and
 * domains replaced when AIOS holds other values; null when the repository's site.json stays as it
 * is.
 */
function siteJson(input: LandingPageFilesInput): string | null {
  const { site } = input;
  if (!input.existingSite) {
    // A new site's leads go to AIOS, which delivers them by the page's settings.
    const created = {
      name: site.name,
      tenantId: site.tenantId,
      clientId: site.clientId,
      leads: { destination: "aios" },
    };
    return json(withSiteSettings(created, site) ?? created);
  }
  const updated = withSiteSettings(input.existingSite, site);
  return updated ? json(updated) : null;
}

/** The site.json with AIOS's tracking and domain in place; null when it already holds both. */
function withSiteSettings(
  existing: Record<string, unknown>,
  site: LandingSite,
): Record<string, unknown> | null {
  const tracked = siteWithTracking(existing, site.tracking);
  return siteWithDomain(tracked ?? existing, site.customDomain) ?? tracked;
}

/** A section in the app's shape: every button leads to the lead form. */
function appBlock(block: LandingBlock): Record<string, unknown> {
  if (block.type === "text" && block.cta) {
    return { ...block, cta: { label: block.cta.label, href: LEAD_FORM } };
  }
  if (block.type !== "cta") {
    return block;
  }
  return {
    type: "cta",
    heading: block.heading,
    ...(block.body ? { body: block.body } : {}),
    cta: { label: block.label, href: LEAD_FORM },
  };
}

/** JSON as the repository's formatter keeps it: two spaces and a final newline. */
function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * The fingerprint of a build: the page's address, its title, its content.json and the site's
 * settings a publish makes live (siteFingerprint). What the user saw in the preview is what gets
 * published, at the address it was previewed for, with the tags and domain a publish makes live.
 * The status is left out on purpose: publishing changes it and nothing else.
 */
export async function buildDigest(
  target: { subdomain: string; slug: string; title: string },
  content: string,
  site: Pick<LandingSite, "tracking" | "customDomain">,
): Promise<string> {
  const settings = siteFingerprint(site);
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      `${target.subdomain}/${target.slug}\n${target.title}\n${content}${settings ? `\n${settings}` : ""}`,
    ),
  );
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * The site settings a build writes into site.json, one line each: the tracking ids, then the
 * domain. Empty when the site has neither, so such a site keeps the digest it had before they
 * existed, and a site with tracking ids only keeps its tracking-era digest.
 */
export function siteFingerprint(
  site: Pick<LandingSite, "tracking" | "customDomain">,
): string {
  return [
    trackingFingerprint(site.tracking),
    domainFingerprint(site.customDomain),
  ]
    .filter(Boolean)
    .join("\n");
}
