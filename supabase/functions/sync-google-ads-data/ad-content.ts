/**
 * The ad's own copy, stored on every ad-level report row so the report can
 * show a Google ad card without asking Google again. Google offers no preview
 * frame, so the card is drawn from these fields. The frontend reads stored
 * rows through storedGoogleAdContent.
 */
export type GoogleAdContent = {
  /** Google's AdType, e.g. RESPONSIVE_SEARCH_AD, VIDEO_RESPONSIVE_AD. */
  ad_type?: string;
  ad_headlines?: Array<string>;
  ad_descriptions?: Array<string>;
  /** The first final URL, as the advertiser entered it (not validated). */
  ad_final_url?: string;
  /** The display path after the domain, e.g. "shoes/sale". */
  ad_display_path?: string;
};

/** Ad types the card draws as a search result; other types get a note. */
export const GOOGLE_TEXT_AD_TYPES: ReadonlyArray<string> = [
  "RESPONSIVE_SEARCH_AD",
  "EXPANDED_TEXT_AD",
];

/**
 * The ad_group_ad fields (Google Ads API v23) the ad query adds for the card.
 * Each is an attribute of the ad, so the rows per ad and day stay the same.
 */
export const AD_CONTENT_GAQL_FIELDS = `
        ad_group_ad.ad.type,
        ad_group_ad.ad.final_urls,
        ad_group_ad.ad.responsive_search_ad.headlines,
        ad_group_ad.ad.responsive_search_ad.descriptions,
        ad_group_ad.ad.responsive_search_ad.path1,
        ad_group_ad.ad.responsive_search_ad.path2,
        ad_group_ad.ad.expanded_text_ad.headline_part1,
        ad_group_ad.ad.expanded_text_ad.headline_part2,
        ad_group_ad.ad.expanded_text_ad.headline_part3,
        ad_group_ad.ad.expanded_text_ad.description,
        ad_group_ad.ad.expanded_text_ad.description2,
        ad_group_ad.ad.expanded_text_ad.path1,
        ad_group_ad.ad.expanded_text_ad.path2,
        ad_group_ad.ad.responsive_display_ad.headlines,
        ad_group_ad.ad.responsive_display_ad.descriptions,
        ad_group_ad.ad.video_responsive_ad.headlines,
        ad_group_ad.ad.video_responsive_ad.descriptions`;

type AdTextAsset = { text?: unknown };

/** The `adGroupAd.ad` object of a searchStream row (camelCase JSON). */
type GaqlAd = {
  type?: unknown;
  finalUrls?: unknown;
  responsiveSearchAd?: {
    headlines?: unknown;
    descriptions?: unknown;
    path1?: unknown;
    path2?: unknown;
  };
  expandedTextAd?: {
    headlinePart1?: unknown;
    headlinePart2?: unknown;
    headlinePart3?: unknown;
    description?: unknown;
    description2?: unknown;
    path1?: unknown;
    path2?: unknown;
  };
  responsiveDisplayAd?: { headlines?: unknown; descriptions?: unknown };
  videoResponsiveAd?: { headlines?: unknown; descriptions?: unknown };
};

/**
 * The card fields of one searchStream ad, with only the fields Google
 * returned: an ad without copy stores nothing extra.
 */
export function googleAdContent(
  ad: GaqlAd | null | undefined,
): GoogleAdContent {
  if (!ad) {
    return {};
  }

  const rsa = ad.responsiveSearchAd;
  const eta = ad.expandedTextAd;
  const headlines = [
    ...assetTexts(rsa?.headlines),
    ...texts([eta?.headlinePart1, eta?.headlinePart2, eta?.headlinePart3]),
    ...assetTexts(ad.responsiveDisplayAd?.headlines),
    ...assetTexts(ad.videoResponsiveAd?.headlines),
  ];
  const descriptions = [
    ...assetTexts(rsa?.descriptions),
    ...texts([eta?.description, eta?.description2]),
    ...assetTexts(ad.responsiveDisplayAd?.descriptions),
    ...assetTexts(ad.videoResponsiveAd?.descriptions),
  ];
  const finalUrl = Array.isArray(ad.finalUrls)
    ? texts(ad.finalUrls)[0]
    : undefined;
  const displayPath = texts([
    rsa?.path1 ?? eta?.path1,
    rsa?.path2 ?? eta?.path2,
  ]).join("/");

  return dropEmpty({
    ad_type: texts([ad.type])[0],
    ad_headlines: headlines,
    ad_descriptions: descriptions,
    ad_final_url: finalUrl,
    ad_display_path: displayPath,
  });
}

/**
 * The card fields of a stored report row, or null when the row has no copy to
 * show (a row synced before the content was stored, a non-ad row, or an ad
 * such as a shopping ad that has a type but no headlines or descriptions).
 * Rows are untrusted JSON, so each field is checked.
 */
export function storedGoogleAdContent(
  data: Record<string, unknown> | null | undefined,
): GoogleAdContent | null {
  if (!data) {
    return null;
  }

  const content = dropEmpty({
    ad_type: texts([data.ad_type])[0],
    ad_headlines: Array.isArray(data.ad_headlines)
      ? texts(data.ad_headlines)
      : [],
    ad_descriptions: Array.isArray(data.ad_descriptions)
      ? texts(data.ad_descriptions)
      : [],
    ad_final_url: texts([data.ad_final_url])[0],
    ad_display_path: texts([data.ad_display_path])[0],
  });

  return content.ad_headlines || content.ad_descriptions ? content : null;
}

/** The text of each AdTextAsset in a repeated field. */
function assetTexts(assets: unknown): Array<string> {
  if (!Array.isArray(assets)) {
    return [];
  }
  return texts(assets.map((asset: AdTextAsset | null) => asset?.text));
}

/** The non-blank strings, trimmed. */
function texts(values: Array<unknown>): Array<string> {
  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

/** The content without blank strings or empty lists. */
function dropEmpty(content: {
  ad_type?: string;
  ad_headlines: Array<string>;
  ad_descriptions: Array<string>;
  ad_final_url?: string;
  ad_display_path?: string;
}): GoogleAdContent {
  const result: GoogleAdContent = {};
  if (content.ad_type) {
    result.ad_type = content.ad_type;
  }
  if (content.ad_headlines.length > 0) {
    result.ad_headlines = content.ad_headlines;
  }
  if (content.ad_descriptions.length > 0) {
    result.ad_descriptions = content.ad_descriptions;
  }
  if (content.ad_final_url) {
    result.ad_final_url = content.ad_final_url;
  }
  if (content.ad_display_path) {
    result.ad_display_path = content.ad_display_path;
  }
  return result;
}
