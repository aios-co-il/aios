import {
  buildDigest,
  landingPageFiles,
  pageFolder,
  siteFile,
} from "./page-files.ts";
import { type LoadPageAsset, withPageAssets } from "./page-assets.ts";
import type { LandingTarget } from "./page-target.ts";
import type { LandingState } from "./project.ts";
import type { LandingRepo } from "./repo.ts";

/** A page's files for one status, ready to push, and what the repository already holds. */
export interface PreparedBuild {
  files: Record<string, string | Uint8Array>;
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
  options: {
    itemId: string;
    status: "draft" | "published";
    today: string;
    loadAsset: LoadPageAsset;
  },
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
  const media = await withPageAssets(state.blocks, folder, options.loadAsset);
  if ("error" in media) {
    return media;
  }
  const existingPage = await repo.readFile(`${folder}/page.json`);
  const files = landingPageFiles({
    site: target.site,
    slug: target.slug,
    title: target.title,
    itemId: options.itemId,
    blocks: media.blocks,
    style: state.style,
    status: options.status,
    existingPage: pageJsonOf(existingPage),
    today: options.today,
    newSite: existingSite === null,
  });
  const digest = await buildDigest(
    { subdomain, slug: target.slug, title: target.title },
    files[`${folder}/content.json`],
  );
  return {
    // The copied assets' paths are in content.json and an asset's file never changes, so the
    // digest of content.json covers them.
    files: { ...files, ...media.files },
    digest,
    // A draft lives on the page's own branch, which every rebuild replaces. A publish gets a
    // branch named after its build, so no later draft can change what a publishing pull request
    // holds.
    branch:
      options.status === "draft"
        ? `page/${subdomain}/${target.slug}`
        : `publish/${subdomain}/${target.slug}-${digest.slice(0, 12)}`,
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

/** An existing page's page.json as an object; null for a new page or one that is not JSON. */
function pageJsonOf(pageJson: string | null): Record<string, unknown> | null {
  if (!pageJson) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(pageJson);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
