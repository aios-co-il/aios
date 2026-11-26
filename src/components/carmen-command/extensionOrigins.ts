import { headers } from "../../../vercel.json";
import { extensionOriginsIn, wholeSitePolicy } from "./frameAncestors";

/**
 * The origins of the AIOS Chrome extension: the ones vercel.json's whole-site rule lets
 * frame the site, so a page that may be framed by an extension and a page that listens to
 * it never disagree. scripts/check-extension-frame-ancestors.ts ties that rule to the
 * extension's keys. Only vercel.json's header rules are imported, not the whole file.
 */
export const EXTENSION_ORIGINS: Array<string> = extensionOriginsIn(
  wholeSitePolicy(headers),
);
