import { LANDING_ROOT_DOMAIN } from "../../../../supabase/functions/_shared/workshop/landing/site-domain.ts";
import {
  TRACKING_ID_KEYS,
  TRACKING_ID_PATTERNS,
  type TrackingIdKey,
} from "../../../../supabase/functions/_shared/workshop/landing/site-tracking.ts";

export { LANDING_ROOT_DOMAIN };

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
  /** The site's tracking ids; an empty string is an id that is not set. */
  tracking: TrackingDraft;
  /** The site's custom domain; an empty string when it has none. */
  customDomain: string;
  /** True once Vercel verified the custom domain, so the site is served on it. */
  customDomainVerified: boolean;
}

/** A site's tracking ids as the panel edits them; an empty string clears an id. */
export type TrackingDraft = Record<TrackingIdKey, string>;

/** Each tracking id's label and an example of its format, for the panel. */
export const TRACKING_FIELDS: Record<
  TrackingIdKey,
  { label: string; example: string }
> = {
  gtmId: { label: "Google Tag Manager", example: "GTM-ABC123" },
  ga4Id: { label: "Google Analytics 4", example: "G-ABC123XYZ" },
  metaPixelId: { label: "Meta Pixel", example: "1234567890123456" },
};

/** No tracking ids at all. */
export const NO_TRACKING: TrackingDraft = {
  gtmId: "",
  ga4Id: "",
  metaPixelId: "",
};

/** What the panel sends when saving; an empty webhook URL keeps the stored one. */
export interface LandingSettingsDraft {
  subdomain: string;
  slug: string;
  leadToCrm: boolean;
  leadToWebhook: boolean;
  webhookUrl: string;
}

/** The form's starting values: what is stored, with the webhook URL always blank. */
export function draftOf(saved: LandingSettings): LandingSettingsDraft {
  return {
    subdomain: saved.subdomain,
    slug: saved.slug,
    leadToCrm: saved.leadToCrm,
    leadToWebhook: saved.leadToWebhook,
    webhookUrl: "",
  };
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

/** Why the tracking ids cannot be saved, in Hebrew; null when they can. */
export function trackingProblem(draft: TrackingDraft): string | null {
  for (const key of TRACKING_ID_KEYS) {
    const id = draft[key].trim();
    if (id && !TRACKING_ID_PATTERNS[key].test(id)) {
      const field = TRACKING_FIELDS[key];
      return `מזהה ${field.label} לא תקין (למשל ${field.example})`;
    }
  }
  return null;
}
