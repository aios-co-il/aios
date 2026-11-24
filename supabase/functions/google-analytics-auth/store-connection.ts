import {
  callbackUri,
  exchangeGoogleCode,
  googleAccountEmail,
} from "../_shared/google-oauth/exchange-code.ts";
import {
  saveTenantConnection,
  tenantConnections,
} from "../_shared/google-oauth/tenant-connection.ts";

const INTEGRATION_TYPE = "google_analytics";

/**
 * Exchanges a Google authorization code and saves the tenant's Analytics
 * connection. Called only from `complete`, after the state was verified for
 * the signed-in user.
 *
 * A reconnect of the same Google account (matched by email) replaces its row;
 * another account is added as a new row. Without an email, the user's own row
 * is replaced so no duplicate appears. The connection serves the whole tenant
 * (SEO reports), not only the person who connected it.
 */
export async function storeAnalyticsConnection(
  code: string,
  tenantId: string,
  userId: string,
): Promise<void> {
  const tokens = await exchangeGoogleCode(
    code,
    callbackUri("google-analytics-auth", "oauth_callback"),
  );
  const googleEmail = await googleAccountEmail(tokens.access_token);
  const rows = await tenantConnections(tenantId, INTEGRATION_TYPE);
  const existing = googleEmail
    ? rows.find((row) => row.settings?.google_email === googleEmail)
    : rows.find((row) => row.user_id === userId);

  await saveTenantConnection({
    tenantId,
    userId,
    integrationType: INTEGRATION_TYPE,
    existing,
    tokens,
    googleEmail,
    visibility: "org",
  });
}
