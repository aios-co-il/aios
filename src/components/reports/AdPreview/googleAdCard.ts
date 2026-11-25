import {
  GOOGLE_TEXT_AD_TYPES,
  type GoogleAdContent,
} from "@functions/sync-google-ads-data/ad-content.ts";

// Google shows up to three headlines on a search result.
const SHOWN_HEADLINES = 3;

/** What the card draws for one Google ad, from its stored copy. */
export type GoogleAdCardView = {
  /** False for Performance Max, video, display and other non-search ads. */
  isTextAd: boolean;
  headline: string;
  descriptions: Array<string>;
  /** The domain and display path, e.g. "shop.example.com/shoes/sale". */
  displayUrl: string | null;
  /** The landing page link; null unless the final URL is http or https. */
  landingHref: string | null;
};

/** The card of a stored Google ad. */
export function googleAdCardView(content: GoogleAdContent): GoogleAdCardView {
  const landing = httpUrlOf(content.ad_final_url);
  const path = content.ad_display_path;
  const domain = landing?.hostname.replace(/^www\./, "") ?? null;
  return {
    isTextAd: GOOGLE_TEXT_AD_TYPES.includes(content.ad_type ?? ""),
    headline: (content.ad_headlines ?? [])
      .slice(0, SHOWN_HEADLINES)
      .join(" | "),
    descriptions: content.ad_descriptions ?? [],
    displayUrl: domain && path ? `${domain}/${path}` : domain,
    landingHref: landing?.href ?? null,
  };
}

/** The URL when it parses and is http or https; anything else is not linked. */
function httpUrlOf(raw: string | undefined): URL | null {
  if (!raw) {
    return null;
  }
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}
