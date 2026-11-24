import {
  callbackUri,
  exchangeGoogleCode,
} from "../_shared/google-oauth/exchange-code.ts";
import {
  saveTenantConnection,
  tenantConnections,
} from "../_shared/google-oauth/tenant-connection.ts";

const INTEGRATION_TYPE = "google_ads";

/**
 * Exchanges a Google authorization code and saves the user's Google Ads
 * connection for the tenant, replacing their earlier one. Called only from
 * `complete`, after the state was verified for the signed-in user.
 */
export async function storeAdsConnection(
  code: string,
  tenantId: string,
  userId: string,
): Promise<void> {
  const tokens = await exchangeGoogleCode(
    code,
    callbackUri("google-ads-auth", "oauth_callback"),
  );
  const rows = await tenantConnections(tenantId, INTEGRATION_TYPE);

  await saveTenantConnection({
    tenantId,
    userId,
    integrationType: INTEGRATION_TYPE,
    existing: rows.find((row) => row.user_id === userId),
    tokens,
  });
}
