/**
 * The per-site grant behind Carmen reading a page: Chrome's prompt for one site, asked
 * from a tap in the panel, never at install. No imports, so the manifest build can read
 * the pattern it declares from here.
 */

/**
 * The manifest's `optional_host_permissions`: any https site may be asked for, one at a
 * time. It adds no install warning; http pages are never granted, so they are never read.
 */
export const GRANTABLE_SITES = "https://*/*";

/** The match pattern Chrome is asked for to read one site: its host, any path, https only. */
export function sitePattern(hostname: string): string {
  return `https://${hostname}/*`;
}

/**
 * The site grants to remove when the panel opens, so a grant lasts one panel session
 * (plan §2.6): every granted origin except the manifest's own host permissions, which
 * Chrome does not let an extension remove.
 */
export function grantsToDrop(
  granted: ReadonlyArray<string>,
  required: ReadonlyArray<string>,
): Array<string> {
  return granted.filter((origin) => !required.includes(origin));
}
