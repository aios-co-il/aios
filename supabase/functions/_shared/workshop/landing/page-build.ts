import {
  buildDigest,
  landingPageFiles,
  pageFolder,
  siteFile,
} from "./page-files.ts";
import {
  type LoadPageAsset,
  mediaFingerprint,
  withPageAssets,
} from "./page-assets.ts";
import type { LandingTarget } from "./page-target.ts";
import type { LandingState } from "./project.ts";
import type { LandingRepo } from "./repo.ts";

/** A page's files for one status, ready to push, and what the repository already holds. */
export interface PreparedBuild {
  files: Record<string, string | Uint8Array>;
  digest: string;
  branch: string;
  newSite: boolean;
  /**
   * True when the build writes site.json (a new site, or new tracking ids). The landing-pages
   * repository merges by itself only a pull request that changes exactly one page folder, so a
   * person merges this one.
   */
  writesSite: boolean;
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
  const siteText = await repo.readFile(siteFile(subdomain));
  const existingSite = siteText === null ? null : jsonObjectOf(siteText);
  if (siteText !== null && !sameOwner(existingSite, target)) {
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
    existingPage: existingPage ? jsonObjectOf(existingPage) : null,
    today: options.today,
    existingSite,
  });
  const digest = await buildDigest(
    { subdomain, slug: target.slug, title: target.title },
    files[`${folder}/content.json`] + (await mediaFingerprint(media.files)),
    target.site.tracking,
  );
  return {
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
    writesSite: siteFile(subdomain) in files,
  };
}

/** True when the repository's site.json names the same org and client as the project's site. */
function sameOwner(
  site: Record<string, unknown> | null,
  target: LandingTarget,
): boolean {
  return (
    site !== null &&
    site.tenantId === target.site.tenantId &&
    site.clientId === target.site.clientId
  );
}

/** A repository JSON file as an object; null for one that is not a JSON object. */
function jsonObjectOf(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
