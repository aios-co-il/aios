import { z } from "npm:zod@3.25.76";

const googleAdsConfigSchema = z
  .object({
    refresh_token: z.unknown(),
    login_customer_id: z.unknown(),
    mcc_id: z.unknown(),
    manager_id: z.unknown(),
  })
  .catch({});

export function googleAdsRefreshToken(settings: unknown): unknown {
  return googleAdsConfigSchema.parse(settings).refresh_token;
}

const googleAdsIntegrationSchema = z
  .object({
    additional_config: googleAdsConfigSchema,
    settings: googleAdsConfigSchema,
    api_key: z.unknown(),
  })
  .catch({ additional_config: {}, settings: {} });

/** Google Ads credentials from a tenant integration; `settings` wins over `additional_config`. */
export function googleAdsCredentials(integration: unknown): {
  refreshToken: unknown;
  loginCustomerId: unknown;
} {
  const { additional_config, settings, api_key } =
    googleAdsIntegrationSchema.parse(integration);
  const cfg = { ...additional_config, ...settings };
  return {
    refreshToken: cfg.refresh_token || api_key,
    loginCustomerId: cfg.login_customer_id || cfg.mcc_id || cfg.manager_id,
  };
}
