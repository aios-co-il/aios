// Microsoft's OAuth redirect: verify the signed state, store the tokens and
// close the popup with the outcome.
import { serviceClient } from "../_shared/supabase-clients.ts";
import {
  accountFromIdToken,
  exchangeCode,
  microsoftOAuthConfig,
} from "./graph-oauth.ts";
import { verifyState } from "./oauth-state.ts";

/** Microsoft redirects here after consent: verify state, store tokens, tell the opener window. */
export async function handleCallback(url: URL): Promise<Response> {
  const providerError = url.searchParams.get("error");
  if (providerError) {
    // Organisations that block user consent answer with an admin-consent error.
    console.error(
      "Microsoft consent declined:",
      providerError,
      url.searchParams.get("error_description"),
    );
    return popupPage(false, consentErrorText(url));
  }
  try {
    const config = microsoftOAuthConfig();
    const state = await verifyState(
      config.clientSecret,
      url.searchParams.get("state") ?? "",
    );
    const code = url.searchParams.get("code");
    if (!state || !code) {
      console.error("microsoft-auth callback: invalid state or missing code");
      return popupPage(false, "הקישור פג תוקף. נסו להתחבר שוב.");
    }
    const tokens = await exchangeCode(config, code);
    const account = accountFromIdToken(tokens.idToken);
    const { error } = await serviceClient().from("microsoft_tokens").upsert(
      {
        user_id: state.userId,
        tenant_id: state.tenantId,
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expires_at: tokens.expiresAt.toISOString(),
        scopes: tokens.scope,
        microsoft_email: account.email,
        ms_tenant_id: account.msTenantId,
        account_type: account.accountType,
        last_refresh_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) {
      throw error;
    }
    return popupPage(true, "Microsoft התחבר בהצלחה!");
  } catch (error) {
    console.error("microsoft-auth callback failed:", error);
    return popupPage(false, "החיבור ל-Microsoft נכשל. נסו שוב.");
  }
}

/** Hebrew text for a declined consent, naming the admin-approval case. */
function consentErrorText(url: URL): string {
  const description = url.searchParams.get("error_description") ?? "";
  // AADSTS65001/90094: the user's organisation requires an admin to approve the app.
  if (/AADSTS(65001|90094|90095)/.test(description)) {
    return "הארגון שלכם דורש אישור מנהל מערכת ב-Microsoft 365 לפני החיבור.";
  }
  return "החיבור ל-Microsoft בוטל.";
}

/** The popup's closing page; it posts only the outcome type, no data. */
function popupPage(ok: boolean, message: string): Response {
  const type = ok ? "microsoft_connected" : "microsoft_error";
  const html = `<!DOCTYPE html>
<html dir="rtl">
  <head>
    <meta charset="utf-8" />
    <title>Microsoft</title>
    <script>
      window.opener?.postMessage({ type: "${type}" }, "*");
      setTimeout(() => window.close(), ${ok ? 1000 : 4000});
    </script>
  </head>
  <body style="font-family: system-ui; text-align: center; padding: 50px;">
    <h1>${ok ? "✅" : "⚠️"} ${message}</h1>
  </body>
</html>`;
  return new Response(html, {
    status: ok ? 200 : 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
