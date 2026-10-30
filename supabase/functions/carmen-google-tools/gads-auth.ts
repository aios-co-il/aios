import { z } from "npm:zod@3.25.76";

/** Truthy stored values as text, the way URLSearchParams / headers stringify them. */
const storedText = z
  .unknown()
  .transform((value) => (value ? String(value) : undefined));

const gadsIntegrationSchema = z
  .object({
    api_key: storedText,
    additional_config: z
      .object({
        refresh_token: storedText,
        developer_token: storedText,
        login_customer_id: storedText,
        mcc_id: storedText,
        client_id: storedText,
        client_secret: storedText,
      })
      .catch({}),
  })
  .catch({ additional_config: {} });

export type GadsAuth = {
  access_token?: string;
  developer_token?: string;
  login_customer_id?: string;
  refresh_token?: string;
  client_id?: string;
  client_secret?: string;
};

type GadsEnv = {
  developerToken?: string;
  clientId?: string;
  clientSecret?: string;
};

/** OAuth/developer credentials from the google_ads integration row; env values win. */
export function gadsAuthFromIntegration(row: unknown, env: GadsEnv): GadsAuth {
  const { api_key, additional_config: cfg } = gadsIntegrationSchema.parse(row);
  return {
    refresh_token: cfg.refresh_token || api_key,
    developer_token: env.developerToken || cfg.developer_token,
    login_customer_id: cfg.login_customer_id || cfg.mcc_id,
    client_id: env.clientId || cfg.client_id,
    client_secret: env.clientSecret || cfg.client_secret,
  };
}
