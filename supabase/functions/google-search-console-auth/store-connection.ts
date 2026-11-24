import {
  callbackUri,
  exchangeGoogleCode,
  googleAccountEmail,
} from "../_shared/google-oauth/exchange-code.ts";
import {
  saveTenantConnection,
  tenantConnections,
} from "../_shared/google-oauth/tenant-connection.ts";

const INTEGRATION_TYPE = "google_search_console";

/**
 * Exchanges a Google authorization code and saves the tenant's Search Console
 * connection. Called only from `complete`, after the state was verified for
 * the signed-in user. A reconnect replaces the row of the same Google account,
 * else the user's own row; otherwise a new row is added.
 */
export async function storeSearchConsoleConnection(
  code: string,
  tenantId: string,
  userId: string,
): Promise<void> {
  const tokens = await exchangeGoogleCode(
    code,
    callbackUri("google-search-console-auth", "oauth_callback"),
  );
  const googleEmail = await googleAccountEmail(tokens.access_token);
  const rows = await tenantConnections(tenantId, INTEGRATION_TYPE);
  const existing =
    (googleEmail &&
      rows.find((row) => row.settings?.google_email === googleEmail)) ||
    rows.find((row) => row.user_id === userId);

  await saveTenantConnection({
    tenantId,
    userId,
    integrationType: INTEGRATION_TYPE,
    existing,
    tokens,
    googleEmail,
  });
}
