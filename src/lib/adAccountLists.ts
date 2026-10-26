import { jsonObjects, readField, readString } from "@/lib/jsonReaders";

export interface FacebookAdAccount {
  id: string;
  name?: string;
  currency?: string;
}

export interface GoogleAdsAccount {
  id: string | number;
  name?: string;
}

/** `get-facebook-ad-accounts` response: `{ ad_accounts: [...] }`. */
export function readFacebookAdAccounts(body: unknown): FacebookAdAccount[] {
  return jsonObjects(readField(body, "ad_accounts")).flatMap((account) =>
    typeof account.id === "string"
      ? [
          {
            id: account.id,
            name: readString(account, "name"),
            currency: readString(account, "currency"),
          },
        ]
      : [],
  );
}

/** `google-ads-auth` `get_accounts` response: `{ accounts: [...] }`. */
export function readGoogleAdsAccounts(body: unknown): GoogleAdsAccount[] {
  return jsonObjects(readField(body, "accounts")).flatMap((account) => {
    const { id } = account;
    return typeof id === "string" || typeof id === "number"
      ? [{ id, name: readString(account, "name") }]
      : [];
  });
}
