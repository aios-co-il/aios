import { z } from "zod";
import type { GoogleAdsAccount } from "@/components/dynamic-tables/googleAdsAccounts";
import { listOf } from "@/lib/jsonReaders";

const optionalString = z.string().optional().catch(undefined);

const facebookAdAccountSchema = z.object({
  id: z.string(),
  name: optionalString,
  currency: optionalString,
});

const googleAdsAccountSchema: z.ZodType<
  GoogleAdsAccount,
  z.ZodTypeDef,
  unknown
> = z.object({
  id: z.union([z.string(), z.number().transform(String)]),
  name: z.string().catch(""),
  currency: z.string().catch(""),
  manager: z.boolean().catch(false),
  manager_id: optionalString,
  integration_id: optionalString,
  integration_user_id: optionalString,
  integration_email: z.string().nullable().optional().catch(undefined),
});

export type FacebookAdAccount = z.infer<typeof facebookAdAccountSchema>;

const facebookAccountsBody = z
  .object({ ad_accounts: listOf(facebookAdAccountSchema) })
  .catch({ ad_accounts: [] });

const googleAccountsBody = z
  .object({ accounts: listOf(googleAdsAccountSchema) })
  .catch({ accounts: [] });

/** `get-facebook-ad-accounts` response: `{ ad_accounts: [...] }`. */
export function readFacebookAdAccounts(body: unknown): FacebookAdAccount[] {
  return facebookAccountsBody.parse(body).ad_accounts;
}

/** `google-ads-auth` `get_accounts` response: `{ accounts: [...] }`. */
export function readGoogleAdsAccounts(body: unknown): GoogleAdsAccount[] {
  return googleAccountsBody.parse(body).accounts;
}
