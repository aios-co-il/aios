/** The root domain every client's landing site is served under. */
export const LANDING_ROOT_DOMAIN = "aios.co.il";

/** The slug of a site's home page, which is served on "/". */
export const HOME_SLUG = "home";

const SUBDOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;

/** A landing project's settings as the panel shows and edits them. */
export interface LandingSettings {
  subdomain: string;
  slug: string;
  leadToCrm: boolean;
  leadToWebhook: boolean;
  /** The client already has a site: its subdomain is fixed. */
  siteExists: boolean;
  /** The project already has a page: its address is fixed, and a webhook URL may be stored. */
  pageExists: boolean;
}

/** What the panel sends when saving; an empty webhook URL keeps the stored one. */
export interface LandingSettingsDraft {
  subdomain: string;
  slug: string;
  leadToCrm: boolean;
  leadToWebhook: boolean;
  webhookUrl: string;
}

/** The public address of a page. */
export function landingPageUrl(subdomain: string, slug: string): string {
  const path = slug === HOME_SLUG ? "" : `/${slug}`;
  return `https://${subdomain}.${LANDING_ROOT_DOMAIN}${path}`;
}

/** Why a draft cannot be saved, in Hebrew; null when it can. */
export function draftProblem(
  draft: LandingSettingsDraft,
  saved: LandingSettings,
): string | null {
  if (!SUBDOMAIN.test(draft.subdomain)) {
    return "תת־דומיין: אותיות קטנות באנגלית, ספרות ומקפים בלבד";
  }
  if (!SLUG.test(draft.slug)) {
    return "כתובת העמוד: אותיות קטנות באנגלית, ספרות ומקפים בלבד";
  }
  const url = draft.webhookUrl.trim();
  if (url && !/^https:\/\/\S+$/.test(url)) {
    return "כתובת הוובהוק חייבת להתחיל ב-https://";
  }
  const hasStoredUrl = saved.pageExists && saved.leadToWebhook;
  if (draft.leadToWebhook && !url && !hasStoredUrl) {
    return "צריך להזין כתובת וובהוק";
  }
  return null;
}
