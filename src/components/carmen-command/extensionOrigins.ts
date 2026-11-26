import vercelConfig from "../../../vercel.json?raw";

/**
 * The origins of the AIOS Chrome extension: the ones vercel.json lets frame the site, so a
 * page that may be framed by an extension and a page that listens to it never disagree.
 * scripts/check-extension-frame-ancestors.ts ties that header to the extension's keys.
 */
export const EXTENSION_ORIGINS: Array<string> =
  extensionOriginsIn(vercelConfig);

/** Every chrome-extension origin a text names. */
export function extensionOriginsIn(text: string): Array<string> {
  return text.match(/chrome-extension:\/\/[a-p]{32}/g) ?? [];
}
