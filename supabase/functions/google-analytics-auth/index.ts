import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  gaHostsMatch,
  listedPropertyMatchesDomain,
  normalizeGaHost,
} from "../_shared/gaDomain.ts";
import { redirectToIntegrations } from "../_shared/google-oauth/app-origin.ts";
import {
  isCompleteRefusal,
  readTenantCompleteRequest,
} from "../_shared/google-oauth/connect-handoff.ts";
import { redirectHandoff } from "../_shared/google-oauth/handoff-response.ts";
import {
  isConnectRefusal,
  readConnectRequest,
} from "../_shared/google-oauth/connect-request.ts";
import {
  oauthStateSecret,
  signOAuthState,
  verifyOAuthState,
} from "../_shared/google-oauth/oauth-state.ts";
import { storeAnalyticsConnection } from "./store-connection.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  // OAuth configuration
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/google-analytics-auth?action=oauth_callback`;

  if (!clientId || !clientSecret) {
    console.error("Missing Google OAuth credentials");
    return new Response(
      JSON.stringify({ error: "Google OAuth credentials not configured" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Handle OAuth initiation
  if (action === "authorize") {
    try {
      const connect = await readConnectRequest(req);
      if (isConnectRefusal(connect)) {
        return new Response(JSON.stringify({ error: connect.error }), {
          status: connect.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { loginHint } = connect;
      const { addNew } = connect.state;

      // Google Analytics scopes
      const scopes = [
        "https://www.googleapis.com/auth/analytics.readonly",
        "https://www.googleapis.com/auth/userinfo.email",
      ].join(" ");

      const state = await signOAuthState(connect.state, oauthStateSecret());

      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", scopes);
      authUrl.searchParams.set("access_type", "offline");
      if (loginHint) {
        // Reconnect flow: preselect the specific Google account being renewed.
        authUrl.searchParams.set("prompt", "consent");
        authUrl.searchParams.set("login_hint", loginHint);
      } else if (addNew) {
        // Adding another account: force the account chooser.
        authUrl.searchParams.set("prompt", "select_account consent");
      } else {
        authUrl.searchParams.set("prompt", "consent");
      }
      authUrl.searchParams.set("state", state);

      return new Response(JSON.stringify({ authUrl: authUrl.toString() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Error generating auth URL:", error);
      return new Response(
        JSON.stringify({ error: "Failed to generate authorization URL" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  }

  // Handle OAuth callback
  if (action === "oauth_callback") {
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    async function getTenantSlug(tenantId: string): Promise<string> {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("slug")
        .eq("id", tenantId)
        .single();
      return tenant?.slug || "app";
    }

    const state = await verifyOAuthState(
      url.searchParams.get("state"),
      oauthStateSecret(),
    );
    if (!state?.tenantId) {
      return redirectToIntegrations(null, "app", { error: "invalid_state" });
    }

    const tenantSlug = await getTenantSlug(state.tenantId);

    if (error) {
      return redirectToIntegrations(state.origin, tenantSlug, { error });
    }

    if (!code) {
      return new Response("Missing code", { status: 400 });
    }

    return redirectHandoff(
      "google-analytics-auth",
      state,
      tenantSlug,
      code,
      url.searchParams.get("state") ?? "",
    );
  }

  // Finish a connect from the signed-in app (see connect-handoff.ts)
  if (action === "complete") {
    try {
      const request = await readTenantCompleteRequest(req);
      if (isCompleteRefusal(request)) {
        return new Response(JSON.stringify({ error: request.error }), {
          status: request.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await storeAnalyticsConnection(
        request.code,
        request.tenantId,
        request.state.userId,
      );

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Analytics complete failed:", error);
      return new Response(
        JSON.stringify({ error: "Could not connect Google Analytics" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  }

  // Get Google Analytics properties
  if (action === "get_properties") {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    try {
      const body = await req.json();
      const integrationId = body?.integrationId;
      const matchDomain = body?.matchDomain;
      const domainQuery =
        typeof matchDomain === "string" ? matchDomain.trim() : "";
      // A domain search looks at several logins. It must not flip their
      // reconnect flag or overwrite the stored token metadata.
      const probe = body?.probe === true;

      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      );

      const supabaseUser = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: userData, error: userError } =
        await supabaseUser.auth.getUser();
      const user = userData?.user;
      if (userError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: allowed, error: permissionError } = await supabase.rpc(
        "user_has_integration_permission",
        { p_user_id: user.id, p_integration_id: integrationId },
      );
      if (permissionError || !allowed) {
        return new Response(
          JSON.stringify({
            error: "Integration not found or access denied",
            properties: [],
          }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const { data: integration, error: integrationError } = await supabase
        .from("tenant_integrations")
        .select("*")
        .eq("id", integrationId)
        .eq("integration_type", "google_analytics")
        .eq("is_active", true)
        .single();

      if (integrationError || !integration) {
        throw new Error("Integration not found");
      }

      let accessToken = integration.api_key;
      let settings = integration.settings as any;
      const ownerEmail = settings?.google_email || null;

      const refreshAccessToken = async (): Promise<{
        ok: boolean;
        reason?: string;
      }> => {
        if (!settings?.refresh_token)
          return { ok: false, reason: "missing_refresh_token" };
        const refreshResponse = await fetch(
          "https://oauth2.googleapis.com/token",
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: clientId,
              client_secret: clientSecret,
              refresh_token: settings.refresh_token,
              grant_type: "refresh_token",
            }),
          },
        );
        const refreshData = await refreshResponse.json().catch(() => ({}));
        if (refreshData.access_token) {
          accessToken = refreshData.access_token;
          const newExpiresAt = new Date(
            Date.now() + refreshData.expires_in * 1000,
          ).toISOString();
          settings = { ...settings, expires_at: newExpiresAt };
          await supabase
            .from("tenant_integrations")
            .update({
              api_key: accessToken,
              settings,
            })
            .eq("id", integrationId);
          return { ok: true };
        }
        return { ok: false, reason: refreshData.error || "refresh_failed" };
      };

      // Proactive refresh if expired
      if (settings?.expires_at && new Date(settings.expires_at) < new Date()) {
        await refreshAccessToken();
      }

      // accountSummaries returns 50 accounts when pageSize is omitted.
      // Ask for the API maximum (200) and follow nextPageToken so a login
      // with 100+ accounts is not cut off after the first page.
      const fetchAccounts = async () => {
        const accountSummaries: any[] = [];
        let pageToken = "";
        for (let page = 0; page < 20; page++) {
          const url = new URL(
            "https://analyticsadmin.googleapis.com/v1beta/accountSummaries",
          );
          url.searchParams.set("pageSize", "200");
          if (pageToken) url.searchParams.set("pageToken", pageToken);
          const response = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const data: any = await response
            .clone()
            .json()
            .catch(() => ({}));
          if (!response.ok || data?.error) return response;
          accountSummaries.push(...(data.accountSummaries || []));
          pageToken = data.nextPageToken || "";
          if (!pageToken) break;
        }
        return new Response(JSON.stringify({ accountSummaries }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      };

      let accountsResponse = await fetchAccounts();
      let accountsData: any = await accountsResponse.json().catch(() => ({}));

      // If credentials invalid, try one forced refresh and retry once.
      const looksUnauthorized =
        accountsResponse.status === 401 ||
        accountsData?.error?.code === 401 ||
        /invalid.*credential|invalid_grant|unauthorized/i.test(
          accountsData?.error?.message || "",
        );

      // Persist the broken state so the settings page shows the red
      // "reconnect needed" state — not only when a data sync fails.
      const markNeedsReauth = async (reason: string) => {
        if (probe) return;
        try {
          await supabase
            .from("tenant_integrations")
            .update({
              settings: {
                ...settings,
                needs_reauth: true,
                reauth_reason: reason,
                reauth_marked_at: new Date().toISOString(),
              },
            })
            .eq("id", integrationId);
        } catch (_e) {
          /* non-fatal */
        }
      };

      if (looksUnauthorized) {
        const refreshResult = await refreshAccessToken();
        if (refreshResult.ok) {
          accountsResponse = await fetchAccounts();
          accountsData = await accountsResponse.json().catch(() => ({}));
        } else {
          const reason = refreshResult.reason || "token_revoked";
          await markNeedsReauth(reason);
          return new Response(
            JSON.stringify({
              properties: [],
              needs_reconnect: true,
              owner_email: ownerEmail,
              reason,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }

      if (accountsData?.error) {
        const stillUnauthorized =
          accountsData.error.code === 401 ||
          /invalid.*credential|invalid_grant|unauthorized/i.test(
            accountsData.error.message || "",
          );
        if (stillUnauthorized) {
          await markNeedsReauth("token_revoked");
          return new Response(
            JSON.stringify({
              properties: [],
              needs_reconnect: true,
              owner_email: ownerEmail,
              reason: "token_revoked",
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        // Non-auth Google error (e.g. 403 / API not enabled / quota). Do NOT crash
        // with an opaque 500 — log the full error for diagnosis and fall back to any
        // previously cached property list so the UI stays usable.
        console.error(
          "GA get_properties Google API error:",
          JSON.stringify(accountsData.error),
        );
        const cachedOnError = Array.isArray(settings?.available_properties)
          ? settings.available_properties
          : [];
        return new Response(
          JSON.stringify({
            properties: cachedOnError,
            needs_reconnect: cachedOnError.length === 0,
            owner_email: ownerEmail,
            reason: "google_api_error",
            error_detail:
              accountsData.error.message || String(accountsData.error),
            error_code: accountsData.error.code ?? null,
            error_status: accountsData.error.status ?? null,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Extract properties from account summaries
      const properties: any[] = [];
      if (accountsData.accountSummaries) {
        for (const account of accountsData.accountSummaries) {
          if (account.propertySummaries) {
            for (const prop of account.propertySummaries) {
              properties.push({
                id: prop.property,
                name: prop.displayName,
                accountName: account.displayName,
              });
            }
          }
        }
      }

      // A domain that is not the property title lives on the web stream URL.
      // Only scan streams when the caller is resolving a domain and the
      // account/property names did not already match.
      if (
        domainQuery &&
        !properties.some((property) =>
          listedPropertyMatchesDomain(property, domainQuery),
        )
      ) {
        const wantedHost = normalizeGaHost(domainQuery);
        let exact = false;
        for (let index = 0; index < properties.length && !exact; index += 8) {
          const batch = properties.slice(index, index + 8);
          await Promise.all(
            batch.map(async (property) => {
              try {
                const response = await fetch(
                  `https://analyticsadmin.googleapis.com/v1beta/${property.id}/dataStreams?pageSize=20`,
                  { headers: { Authorization: `Bearer ${accessToken}` } },
                );
                if (!response.ok) return;
                const data = await response.json().catch(() => ({}));
                for (const stream of data.dataStreams || []) {
                  const uri = stream?.webStreamData?.defaultUri;
                  if (!uri || !gaHostsMatch(uri, domainQuery)) continue;
                  property.websiteUrl = uri;
                  if (normalizeGaHost(uri) === wantedHost) exact = true;
                }
              } catch (_e) {
                /* this property has no readable stream */
              }
            }),
          );
        }
      }

      // Cache the fresh list so the UI can fall back to it if a future call
      // fails, and clear any stale reconnect flag — this call just succeeded.
      // Domain search (probe) only reads; it leaves each login's settings alone.
      if (!probe) {
        try {
          await supabase
            .from("tenant_integrations")
            .update({
              settings: {
                ...settings,
                available_properties: properties,
                needs_reauth: false,
                reauth_reason: null,
              },
            })
            .eq("id", integrationId);
        } catch (_e) {
          /* non-fatal */
        }
      }

      return new Response(
        JSON.stringify({ properties, owner_email: ownerEmail }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } catch (error: any) {
      console.error("Error fetching properties:", error);
      return new Response(
        JSON.stringify({ error: error.message || String(error) }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  }

  return new Response(JSON.stringify({ error: "Invalid action" }), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
