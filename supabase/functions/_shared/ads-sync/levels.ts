/** Report levels of the ads syncs, top-down. A row without `entity_level` is a campaign row. */
export const ADS_LEVELS = ["campaign", "adset", "ad"] as const;

export type AdsEntityLevel = (typeof ADS_LEVELS)[number];
