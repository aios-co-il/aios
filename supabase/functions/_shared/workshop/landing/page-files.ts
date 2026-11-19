/**
 * A landing page as files of the landing-pages app: content.json (the sections and the theme) and
 * page.json (title and status), plus site.json for a client's first page. The app owns these
 * formats (aios-co-il/landing-pages: src/lib/content.ts, page-meta.ts, site-meta.ts) and its
 * check-pages is the final gate.
 */
import type { LandingBlock } from "./page-content.ts";
import type { LandingStyle } from "./page-style.ts";

/** Every call to action on the page scrolls to its lead form. */
const LEAD_FORM = "#lead-form";

export interface LandingSite {
  subdomain: string;
  tenantId: string;
  clientId: string;
  name: string;
}

export interface LandingPageFilesInput {
  site: LandingSite;
  slug: string;
  title: string;
  itemId: string;
  blocks: Array<LandingBlock>;
  style: LandingStyle;
  status: "draft" | "published";
  /** The day the page was first built, kept when it is rebuilt; today for a new page. */
  createdAt: string;
  today: string;
  /** True for the client's first page: the site folder does not exist yet. */
  newSite: boolean;
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
    [`${folder}/page.json`]: json({
      title: input.title,
      status: input.status,
      brief: { source: `Carmen Workshop: פרויקט ${input.itemId}` },
      createdBy: "carmen",
      createdAt: input.createdAt,
      updatedAt: input.today,
    }),
  };
  if (input.newSite) {
    // A new site's leads go to AIOS, which delivers them by the page's settings.
    files[siteFile(input.site.subdomain)] = json({
      name: input.site.name,
      tenantId: input.site.tenantId,
      clientId: input.site.clientId,
      leads: { destination: "aios" },
    });
    files[`landing-pages/${input.site.subdomain}/assets/.gitkeep`] = "";
  }
  return files;
}

/** A section in the app's shape: only the call to action differs from how Carmen saves it. */
function appBlock(block: LandingBlock): Record<string, unknown> {
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
 * The fingerprint of a build: the page's address, its title and its content.json. What the user
 * saw in the preview is what gets published, at the address it was previewed for. The status is
 * left out on purpose: publishing changes it and nothing else.
 */
export async function buildDigest(
  target: { subdomain: string; slug: string; title: string },
  content: string,
): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      `${target.subdomain}/${target.slug}\n${target.title}\n${content}`,
    ),
  );
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
