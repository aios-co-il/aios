/**
 * Where a client's Meta ad account is recorded besides
 * clients.meta_ads_account_id: the integration_settings of its report tables
 * of these types, under these keys. carmen-fb-tools reads a client's ad
 * account through these links and the user scope check (./store.ts) follows
 * the same ones, so a new key is added here once for both.
 */

export const META_TABLE_TYPES: readonly string[] = [
  "facebook_insights",
  "facebook_ecommerce",
];

export const META_SETTING_KEYS: readonly string[] = [
  "ad_account_id",
  "account_id",
  "meta_account_id",
];
