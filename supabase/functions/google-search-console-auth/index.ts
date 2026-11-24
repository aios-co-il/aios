import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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
import { storeSearchConsoleConnection } from "./store-connection.ts";
import { callbackUri } from "../_shared/google-oauth/exchange-code.ts";

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

      const { addNew } = connect.state;

      // Google Search Console scopes (+ userinfo.email so we can identify the Google account)
      const scopes = [
        "https://www.googleapis.com/auth/webmasters.readonly",
        "https://www.googleapis.com/auth/userinfo.email",
      ].join(" ");

      const state = await signOAuthState(connect.state, oauthStateSecret());

      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set(
        "redirect_uri",
        callbackUri("google-search-console-auth", "oauth_callback"),
      );
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", scopes);
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "consent");
      if (addNew) {
        authUrl.searchParams.set("login_hint", "");
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
      "google-search-console-auth",
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

      await storeSearchConsoleConnection(
        request.code,
        request.tenantId,
        request.state.userId,
      );

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Search Console complete failed:", error);
      return new Response(
        JSON.stringify({ error: "Could not connect Google Search Console" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  }

  // Get Search Console sites
  if (action === "get_sites") {
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
      const { integrationId } = await req.json();

      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      );

      const { data: integration, error: integrationError } = await supabase
        .from("tenant_integrations")
        .select("*")
        .eq("id", integrationId)
        .single();

      if (integrationError || !integration) {
        throw new Error("Integration not found");
      }

      let accessToken = integration.api_key;
      const settings = integration.settings as any;
      const ownerEmail = settings?.google_email || null;

      const refreshAccessToken = async (): Promise<{
        ok: boolean;
        reason?: string;
      }> => {
        if (!settings?.refresh_token) {
          return { ok: false, reason: "missing_refresh_token" };
        }
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
          await supabase
            .from("tenant_integrations")
            .update({
              api_key: accessToken,
              settings: { ...settings, expires_at: newExpiresAt },
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

      const fetchSites = () =>
        fetch("https://www.googleapis.com/webmasters/v3/sites", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

      let sitesResponse = await fetchSites();
      let sitesData: any = await sitesResponse.json().catch(() => ({}));

      // If credentials invalid, try one forced refresh and retry once.
      const looksUnauthorized =
        sitesResponse.status === 401 ||
        sitesData?.error?.code === 401 ||
        /invalid.*credential|invalid_grant|unauthorized/i.test(
          sitesData?.error?.message || "",
        );

      if (looksUnauthorized) {
        const refreshResult = await refreshAccessToken();
        if (refreshResult.ok) {
          sitesResponse = await fetchSites();
          sitesData = await sitesResponse.json().catch(() => ({}));
        } else {
          return new Response(
            JSON.stringify({
              sites: [],
              needs_reconnect: true,
              owner_email: ownerEmail,
              reason: refreshResult.reason || "token_revoked",
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }

      if (sitesData?.error) {
        // Still failing after refresh -> reconnect required.
        const stillUnauthorized =
          sitesData.error.code === 401 ||
          /invalid.*credential|invalid_grant|unauthorized/i.test(
            sitesData.error.message || "",
          );
        if (stillUnauthorized) {
          return new Response(
            JSON.stringify({
              sites: [],
              needs_reconnect: true,
              owner_email: ownerEmail,
              reason: "token_revoked",
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        // Non-auth Google error (e.g. 403 insufficientPermissions / API not
        // enabled / quota). Do NOT crash with an opaque 500 — log the full error
        // for diagnosis and fall back to any previously cached site list so the
        // UI stays usable instead of looping on "reconnect".
        console.error(
          "GSC get_sites Google API error:",
          JSON.stringify(sitesData.error),
        );
        const cachedOnError = Array.isArray(settings?.available_sites)
          ? settings.available_sites
          : [];
        return new Response(
          JSON.stringify({
            sites: cachedOnError,
            needs_reconnect: cachedOnError.length === 0,
            owner_email: ownerEmail,
            reason: "google_api_error",
            error_detail: sitesData.error.message || String(sitesData.error),
            error_code: sitesData.error.code ?? null,
            error_status: sitesData.error.status ?? null,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const sites = (sitesData.siteEntry || []).map((site: any) => ({
        siteUrl: site.siteUrl,
        permissionLevel: site.permissionLevel,
      }));

      // Cache the fresh list back into settings.available_sites so the UI can
      // fall back to it even if a future call fails.
      try {
        await supabase
          .from("tenant_integrations")
          .update({
            settings: { ...settings, available_sites: sites },
          })
          .eq("id", integrationId);
      } catch (_e) {
        /* non-fatal */
      }

      return new Response(JSON.stringify({ sites, owner_email: ownerEmail }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (error: any) {
      console.error("Error fetching sites:", error);
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
