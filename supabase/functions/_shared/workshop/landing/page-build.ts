import {
  contentDigest,
  landingPageFiles,
  pageFolder,
  siteFile,
} from "./page-files.ts";
import type { LandingTarget } from "./page-target.ts";
import type { LandingState } from "./project.ts";
import type { LandingRepo } from "./repo.ts";

/** A page's files for one status, ready to push, and what the repository already holds. */
export interface PreparedBuild {
  files: Record<string, string>;
  digest: string;
  branch: string;
  newSite: boolean;
}

/**
 * Prepares a build of the project's approved copy and style. Refuses a subdomain whose site in
 * the repository belongs to another org or client: the address is public, so it fails closed.
 */
export async function prepareBuild(
  repo: LandingRepo,
  target: LandingTarget,
  state: LandingState,
  options: { itemId: string; status: "draft" | "published"; today: string },
): Promise<PreparedBuild | { error: string }> {
  if (!state.blocks || !state.style) {
    return { error: "אין קופי וסגנון מאושרים לבנות מהם" };
  }
  const { subdomain } = target.site;
  const existingSite = await repo.readFile(siteFile(subdomain));
  if (existingSite !== null && !sameOwner(existingSite, target)) {
    console.error(
      `landing build: site ${subdomain} in the repository belongs to another org or client`,
    );
    return {
      error: `הכתובת ${subdomain} כבר שייכת לאתר אחר. צריך לבחור כתובת אחרת בהגדרות.`,
    };
  }
  const folder = pageFolder(subdomain, target.slug);
  const existingPage = await repo.readFile(`${folder}/page.json`);
  const files = landingPageFiles({
    site: target.site,
    slug: target.slug,
    title: target.title,
    itemId: options.itemId,
    blocks: state.blocks,
    style: state.style,
    status: options.status,
    createdAt: createdAtOf(existingPage) ?? options.today,
    today: options.today,
    newSite: existingSite === null,
  });
  return {
    files,
    digest: await contentDigest(files[`${folder}/content.json`]),
    branch: `page/${subdomain}/${target.slug}`,
    newSite: existingSite === null,
  };
}

/** True when the repository's site.json names the same org and client as the project's site. */
function sameOwner(siteJson: string, target: LandingTarget): boolean {
  try {
    const site = JSON.parse(siteJson) as Record<string, unknown>;
    return (
      site.tenantId === target.site.tenantId &&
      site.clientId === target.site.clientId
    );
  } catch {
    return false;
  }
}

/** The day an existing page was first built, from its page.json. */
function createdAtOf(pageJson: string | null): string | null {
  if (!pageJson) {
    return null;
  }
  try {
    const created = (JSON.parse(pageJson) as Record<string, unknown>).createdAt;
    return typeof created === "string" ? created : null;
  } catch {
    return null;
  }
}
