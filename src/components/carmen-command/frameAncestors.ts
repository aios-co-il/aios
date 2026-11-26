/**
 * How vercel.json says who may frame the site. Pure, so the site reads its trusted
 * extension origins with it and scripts/check-extension-frame-ancestors.ts checks the same
 * rule against the extension's keys.
 */

/** The vercel.json rule that covers every path of the site. */
export const WHOLE_SITE = "/(.*)";

type VercelHeader = { key: string; value: string };
type VercelHeaderRule = { source: string; headers: Array<VercelHeader> };

/** The Content-Security-Policy vercel.json sends on every path; undefined when it sends none. */
export function wholeSitePolicy(
  rules: Array<VercelHeaderRule> | undefined,
): string | undefined {
  return rules
    ?.find((rule) => rule.source === WHOLE_SITE)
    ?.headers.find((header) => header.key === "Content-Security-Policy")?.value;
}

/** Every chrome-extension origin a policy names. */
export function extensionOriginsIn(policy: string | undefined): Array<string> {
  return policy?.match(/chrome-extension:\/\/[a-p]{32}/g) ?? [];
}
