import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.75.0";
import {
  asArray,
  asRecord,
  asRecords,
  errorMessage,
  optString,
} from "../_shared/provider-json-b23.ts";

type GoogleAdsIntegration = {
  id: string;
  api_key: string;
  user_id: string | null;
  settings: unknown;
};

type GoogleAdsAccount = {
  id: string;
  name: unknown;
  currency: unknown;
  manager: boolean;
  manager_id?: string;
};

const STALE_AUTH_KEYS = [
  "needs_reauth",
  "last_auth_error",
  "last_auth_error_at",
];

/** Settings after a successful refresh: new expiry, previous auth-error flags dropped. */
function refreshedSettings(settings: unknown, expiresAt: string) {
  const next: Record<string, unknown> = {
    ...asRecord(settings),
    expires_at: expiresAt,
  };
  for (const key of STALE_AUTH_KEYS) delete next[key];
  return next;
}

function isTokenExpired(settings: unknown): boolean {
  const expiresAt = asRecord(settings).expires_at;
  return (
    (typeof expiresAt === "string" || typeof expiresAt === "number") &&
    !!expiresAt &&
    new Date(expiresAt) < new Date()
  );
}

const firstCustomer = (data: unknown) =>
  asRecord(asRecord(asArray(asRecord(data).results)[0]).customer);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Google OAuth2 configuration
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
const DEVELOPER_TOKEN = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") || "";
const REDIRECT_URI = `${Deno.env.get("SUPABASE_URL")}/functions/v1/google-ads-auth?action=oauth_callback`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // Handle OAuth callback
    if (action === "oauth_callback") {
      return handleOAuthCallback(url);
    }

    // All other actions require authentication
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      },
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tenantId } = await supabase.rpc("get_user_tenant_id", {
      _user_id: user.id,
    });
    if (!tenantId) {
      return new Response(JSON.stringify({ error: "No tenant found" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: unknown = {};
    if (req.method === "POST") {
      try {
        const text = await req.text();
        body = text ? JSON.parse(text) : {};
      } catch {
        body = {};
      }
    }

    switch (action || asRecord(body).action) {
      case "get_auth_url":
        return getAuthUrl(tenantId, user.id, optString(asRecord(body).origin));

      case "get_accounts":
        return getGoogleAdsAccounts(supabase, tenantId, user.id);

      case "refresh_token":
        return refreshAccessToken(supabase, tenantId);

      case "disconnect":
        return disconnectGoogleAds(supabase, tenantId);

      case "check_status":
        return checkConnectionStatus(supabase, tenantId, user.id);

      default:
        return new Response(JSON.stringify({ error: "Invalid action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (error) {
    console.error("Error in google-ads-auth:", error);
    return new Response(JSON.stringify({ error: errorMessage(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function getAuthUrl(tenantId: string, userId: string, origin?: string) {
  const state = btoa(
    JSON.stringify({ tenantId, userId, origin: origin || null }),
  );

  const scopes = ["https://www.googleapis.com/auth/adwords"];

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopes.join(" "));
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);

  return new Response(JSON.stringify({ auth_url: authUrl.toString() }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handleOAuthCallback(url: URL) {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  // Create supabase client for database operations
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // Helper function to get tenant slug for redirect
  async function getTenantSlug(tenantId: string): Promise<string> {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("slug")
      .eq("id", tenantId)
      .single();
    return tenant?.slug || "app";
  }

  // Try to extract origin from state for accurate redirects on error too.
  let stateOrigin: string | null = null;
  let stateTenantId: string | null = null;
  if (state) {
    try {
      const parsed = JSON.parse(atob(state));
      stateOrigin = parsed.origin || null;
      stateTenantId = parsed.tenantId || null;
    } catch {
      /* noop */
    }
  }
  // Strip any trailing slash so `${APP_BASE}/t/...` never produces a double slash.
  const APP_BASE = (
    stateOrigin ||
    Deno.env.get("APP_URL") ||
    "https://after-lead.com"
  ).replace(/\/+$/, "");

  if (error) {
    const slug = stateTenantId ? await getTenantSlug(stateTenantId) : "app";
    const redirectUrl = `${APP_BASE}/t/${slug}/integrations?error=${error}`;
    return new Response(null, {
      status: 302,
      headers: { Location: redirectUrl },
    });
  }

  if (!code || !state) {
    return new Response("Missing code or state", { status: 400 });
  }

  try {
    const { tenantId, userId } = JSON.parse(atob(state));
    const tenantSlug = await getTenantSlug(tenantId);

    // Exchange code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: REDIRECT_URI,
      }),
    });

    const tokens = await tokenResponse.json();

    if (tokens.error) {
      throw new Error(tokens.error_description || tokens.error);
    }

    // Calculate token expiry
    const expiresAt = new Date(
      Date.now() + tokens.expires_in * 1000,
    ).toISOString();

    // Check if integration already exists
    const { data: existing } = await supabase
      .from("tenant_integrations")
      .select("id, settings")
      .eq("tenant_id", tenantId)
      .eq("integration_type", "google_ads")
      .eq("user_id", userId)
      .maybeSingle();

    const existingAdsSettings =
      (existing?.settings as Record<string, unknown> | null) || {};
    const integrationData = {
      is_active: true,
      api_key: tokens.access_token,
      settings: {
        ...existingAdsSettings,
        refresh_token:
          tokens.refresh_token || existingAdsSettings?.refresh_token,
        expires_at: expiresAt,
        connected_at: new Date().toISOString(),
        // Clear any stale reconnect flags on successful re-authorization
        needs_reauth: false,
        reauth_reason: null,
        reauth_marked_at: null,
      },
      updated_at: new Date().toISOString(),
    };

    let saveError;
    if (existing) {
      // Update existing integration
      const { error } = await supabase
        .from("tenant_integrations")
        .update(integrationData)
        .eq("id", existing.id);
      saveError = error;
    } else {
      // Insert new integration
      const { error } = await supabase.from("tenant_integrations").insert({
        tenant_id: tenantId,
        user_id: userId,
        integration_type: "google_ads",
        ...integrationData,
      });
      saveError = error;
    }

    if (saveError) {
      console.error("Error saving tokens:", saveError);
      throw saveError;
    }

    // Redirect back to integrations page on the user's original origin
    const redirectUrl = `${APP_BASE}/t/${tenantSlug}/integrations?google_ads=connected`;
    return new Response(null, {
      status: 302,
      headers: { Location: redirectUrl },
    });
  } catch (err) {
    console.error("OAuth callback error:", err);
    const slug = stateTenantId ? await getTenantSlug(stateTenantId) : "app";
    const redirectUrl = `${APP_BASE}/t/${slug}/integrations?error=${encodeURIComponent(String(errorMessage(err)))}`;
    return new Response(null, {
      status: 302,
      headers: { Location: redirectUrl },
    });
  }
}

async function refreshAccessToken(_supabase: SupabaseClient, tenantId: string) {
  // Use service role client for token refresh to avoid RLS issues
  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data: integration } = await serviceClient
    .from("tenant_integrations")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("integration_type", "google_ads")
    .eq("is_active", true)
    .maybeSingle();

  if (!integration?.settings?.refresh_token) {
    return new Response(JSON.stringify({ error: "No refresh token found" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: integration.settings.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  const tokens = await tokenResponse.json();

  if (tokens.error) {
    console.error(
      "Token refresh failed:",
      tokens.error,
      tokens.error_description,
    );
    const isPermanent =
      tokens.error === "invalid_grant" ||
      tokens.error === "unauthorized_client" ||
      tokens.error === "invalid_client";
    if (isPermanent) {
      await serviceClient
        .from("tenant_integrations")
        .update({
          is_active: false,
          settings: {
            ...integration.settings,
            needs_reauth: true,
            last_auth_error: `${tokens.error}${tokens.error_description ? ": " + tokens.error_description : ""}`,
            last_auth_error_at: new Date().toISOString(),
          },
        })
        .eq("id", integration.id);
    }
    return new Response(
      JSON.stringify({
        error: tokens.error_description || tokens.error,
        needs_reauth: isPermanent,
      }),
      {
        status: isPermanent ? 401 : 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const expiresAt = new Date(
    Date.now() + tokens.expires_in * 1000,
  ).toISOString();

  await serviceClient
    .from("tenant_integrations")
    .update({
      api_key: tokens.access_token,
      is_active: true,
      settings: refreshedSettings(integration.settings, expiresAt),
    })
    .eq("id", integration.id);

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getAccessibleGoogleAdsIntegrations(
  serviceClient: SupabaseClient,
  tenantId: string,
  userId: string,
): Promise<GoogleAdsIntegration[]> {
  // Source tenants from cross-tenant agency access (current tenant accesses others' agencies)
  const { data: accessRows } = await serviceClient
    .from("agency_tenant_access")
    .select("source_tenant_id")
    .eq("accessing_tenant_id", tenantId);
  const sourceTenantIds = Array.from(
    new Set([
      tenantId,
      ...(accessRows || [])
        .map((r: { source_tenant_id: string | null }) => r.source_tenant_id)
        .filter(Boolean),
    ]),
  );

  const { data: tenantIntegrations } = await serviceClient
    .from("tenant_integrations")
    .select("*")
    .in("tenant_id", sourceTenantIds)
    .eq("integration_type", "google_ads")
    .eq("is_active", true);

  // Integrations explicitly shared with the user
  const { data: permissions } = await serviceClient
    .from("integration_user_permissions")
    .select("integration_id")
    .eq("user_id", userId);
  const sharedIds = (permissions || []).map(
    (p: { integration_id: string }) => p.integration_id,
  );

  let sharedIntegrations: GoogleAdsIntegration[] = [];
  if (sharedIds.length > 0) {
    const { data } = await serviceClient
      .from("tenant_integrations")
      .select("*")
      .in("id", sharedIds)
      .eq("integration_type", "google_ads")
      .eq("is_active", true);
    sharedIntegrations = data || [];
  }

  const map = new Map<string, GoogleAdsIntegration>();
  for (const i of [...(tenantIntegrations || []), ...sharedIntegrations]) {
    if (i?.id && i?.api_key) map.set(i.id, i);
  }
  return Array.from(map.values());
}

async function refreshIntegrationToken(
  serviceClient: SupabaseClient,
  integration: GoogleAdsIntegration,
): Promise<GoogleAdsIntegration> {
  const settings = asRecord(integration.settings);
  if (!settings.refresh_token) return integration;
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: String(settings.refresh_token),
      grant_type: "refresh_token",
    }),
  });
  const tokens = await tokenResponse.json();
  if (tokens.error) {
    console.error(
      "Token refresh failed for integration",
      integration.id,
      tokens.error,
    );
    const isPermanent =
      tokens.error === "invalid_grant" ||
      tokens.error === "unauthorized_client" ||
      tokens.error === "invalid_client";
    if (isPermanent) {
      await serviceClient
        .from("tenant_integrations")
        .update({
          is_active: false,
          settings: {
            ...settings,
            needs_reauth: true,
            last_auth_error: `${tokens.error}${tokens.error_description ? ": " + tokens.error_description : ""}`,
            last_auth_error_at: new Date().toISOString(),
          },
        })
        .eq("id", integration.id);
    }
    return integration;
  }
  const expiresAt = new Date(
    Date.now() + tokens.expires_in * 1000,
  ).toISOString();
  const newSettings = refreshedSettings(integration.settings, expiresAt);
  await serviceClient
    .from("tenant_integrations")
    .update({
      api_key: tokens.access_token,
      is_active: true,
      settings: newSettings,
    })
    .eq("id", integration.id);
  return {
    ...integration,
    api_key: tokens.access_token,
    settings: newSettings,
  };
}

async function fetchAccountsForIntegration(
  integration: GoogleAdsIntegration,
): Promise<GoogleAdsAccount[]> {
  const accessToken = integration.api_key;
  const response = await fetch(
    "https://googleads.googleapis.com/v23/customers:listAccessibleCustomers",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": DEVELOPER_TOKEN,
      },
    },
  );

  const accessibleCustomersResult = await parseGoogleAdsJsonResponse(
    response,
    `load accessible Google Ads accounts for integration ${integration.id}`,
  );

  if (!accessibleCustomersResult.success) return [];

  const accounts: GoogleAdsAccount[] = [];
  const resourceNames = asArray(
    asRecord(accessibleCustomersResult.data).resourceNames,
  );
  const detailQuery = `
    SELECT
      customer.id,
      customer.descriptive_name,
      customer.currency_code,
      customer.manager
    FROM customer
    LIMIT 1
  `;

  const mccIds: string[] = [];
  const failedIds: string[] = [];

  for (const resourceName of resourceNames) {
    const customerId =
      typeof resourceName === "string" ? resourceName.split("/")[1] : null;
    if (!customerId) continue;
    try {
      const detailResponse = await fetch(
        `https://googleads.googleapis.com/v23/customers/${customerId}/googleAds:search`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "developer-token": DEVELOPER_TOKEN,
            "Content-Type": "application/json",
            "login-customer-id": customerId,
          },
          body: JSON.stringify({ query: detailQuery }),
        },
      );
      const detailResult = await parseGoogleAdsJsonResponse(
        detailResponse,
        `load details for account ${customerId}`,
      );
      if (!detailResult.success) {
        failedIds.push(customerId);
        continue;
      }
      const customer = firstCustomer(detailResult.data);
      const isManager = Boolean(customer.manager);
      if (isManager) mccIds.push(customerId);
      accounts.push({
        id: customerId,
        name: customer.descriptiveName || `Account ${customerId}`,
        currency: customer.currencyCode || "ILS",
        manager: isManager,
      });
    } catch (err) {
      console.warn(`Exception for ${customerId}:`, err);
      failedIds.push(customerId);
    }
  }

  for (const customerId of failedIds) {
    let found = false;
    for (const mccId of mccIds) {
      try {
        const detailResponse = await fetch(
          `https://googleads.googleapis.com/v23/customers/${customerId}/googleAds:search`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "developer-token": DEVELOPER_TOKEN,
              "Content-Type": "application/json",
              "login-customer-id": mccId,
            },
            body: JSON.stringify({ query: detailQuery }),
          },
        );
        const detailResult = await parseGoogleAdsJsonResponse(
          detailResponse,
          `load details for account ${customerId} via MCC ${mccId}`,
        );
        if (detailResult.success) {
          const customer = firstCustomer(detailResult.data);
          accounts.push({
            id: customerId,
            name: customer.descriptiveName || `Account ${customerId}`,
            currency: customer.currencyCode || "ILS",
            manager: Boolean(customer.manager),
            manager_id: mccId,
          });
          found = true;
          break;
        }
      } catch {
        // Try the next manager account; fall back to the customer ID if none succeeds.
      }
    }
    if (!found) {
      accounts.push({
        id: customerId,
        name: `Account ${customerId}`,
        currency: "ILS",
        manager: false,
      });
    }
  }

  const existingIds = new Set(accounts.map((a) => a.id));
  const childQuery = `
    SELECT
      customer_client.id,
      customer_client.descriptive_name,
      customer_client.currency_code,
      customer_client.manager,
      customer_client.status
    FROM customer_client
    WHERE customer_client.status = 'ENABLED'
      AND customer_client.manager = false
  `;

  for (const mccId of mccIds) {
    try {
      const childResponse = await fetch(
        `https://googleads.googleapis.com/v23/customers/${mccId}/googleAds:search`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "developer-token": DEVELOPER_TOKEN,
            "Content-Type": "application/json",
            "login-customer-id": mccId,
          },
          body: JSON.stringify({ query: childQuery }),
        },
      );
      const childResult = await parseGoogleAdsJsonResponse(
        childResponse,
        `load child accounts for MCC ${mccId}`,
      );
      const childRows = childResult.success
        ? asRecord(childResult.data).results
        : undefined;
      if (childRows) {
        for (const row of asRecords(childRows)) {
          const client = asRecord(row.customerClient);
          if (!client.id) continue;
          const childId = String(client.id);
          if (existingIds.has(childId)) {
            const existing = accounts.find((a) => a.id === childId);
            if (existing && !existing.manager_id) existing.manager_id = mccId;
            continue;
          }
          existingIds.add(childId);
          accounts.push({
            id: childId,
            name: client.descriptiveName || `Account ${childId}`,
            currency: client.currencyCode || "ILS",
            manager: Boolean(client.manager),
            manager_id: mccId,
          });
        }
      }
    } catch (err) {
      console.warn(`Failed to fetch children for MCC ${mccId}:`, err);
    }
  }

  return accounts;
}

async function getGoogleAdsAccounts(
  _supabase: SupabaseClient,
  tenantId: string,
  userId: string,
) {
  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const integrations = await getAccessibleGoogleAdsIntegrations(
    serviceClient,
    tenantId,
    userId,
  );

  if (integrations.length === 0) {
    return new Response(
      JSON.stringify({ error: "Google Ads not connected", accounts: [] }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const refreshed = await Promise.all(
    integrations.map(async (i) => {
      if (isTokenExpired(i.settings)) {
        return await refreshIntegrationToken(serviceClient, i);
      }
      return i;
    }),
  );

  // Annotate every account with the connection (tenant_integrations row) it came from,
  // so the table-create dialog can pin that exact connection (integrationId) on the table.
  // This is what makes per-user + shared connections work at sync time.
  const allAccountsArrays = await Promise.all(
    refreshed.map(async (integ) => {
      const accs = await fetchAccountsForIntegration(integ);
      return accs.map((a) => ({
        ...a,
        integration_id: integ.id,
        integration_user_id: integ.user_id,
        integration_email: asRecord(integ.settings).google_email || null,
      }));
    }),
  );

  // Dedup by account id. When the same account is reachable from more than one connection,
  // prefer the current user's OWN connection so "my report" uses my login by default.
  const map = new Map<string, (typeof allAccountsArrays)[number][number]>();
  for (const arr of allAccountsArrays) {
    for (const acc of arr) {
      const existing = map.get(acc.id);
      if (!existing) {
        map.set(acc.id, acc);
        continue;
      }
      const existingIsOwn = existing.integration_user_id === userId;
      const accIsOwn = acc.integration_user_id === userId;
      if (accIsOwn && !existingIsOwn) map.set(acc.id, acc);
    }
  }

  return new Response(JSON.stringify({ accounts: Array.from(map.values()) }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function parseGoogleAdsJsonResponse(
  response: Response,
  context: string,
): Promise<
  { success: true; data: unknown } | { success: false; error: string }
> {
  const responseText = await response.text();

  console.log(
    `Google Ads ${context} - Status: ${response.status}, Content-Type: ${response.headers.get("content-type")}, Body (first 500): ${responseText.substring(0, 500)}`,
  );

  try {
    const data: unknown = JSON.parse(responseText);
    const dataError = asRecord(data).error;

    if (!response.ok || dataError) {
      const errMsg =
        optString(asRecord(dataError).message) ||
        `Google Ads request failed (status ${response.status}).`;
      console.error(`Google Ads error for ${context}: ${errMsg}`);
      return {
        success: false,
        error: errMsg,
      };
    }

    return { success: true, data };
  } catch {
    console.error(
      `Google Ads returned non-JSON response while trying to ${context}:`,
      responseText.substring(0, 500),
    );

    return {
      success: false,
      error: `Google Ads returned an invalid response (status ${response.status}) while trying to ${context}. Response: ${responseText.substring(0, 200)}`,
    };
  }
}

async function disconnectGoogleAds(supabase: SupabaseClient, tenantId: string) {
  await supabase
    .from("tenant_integrations")
    .update({ is_active: false })
    .eq("tenant_id", tenantId)
    .eq("integration_type", "google_ads");

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function checkConnectionStatus(
  _supabase: SupabaseClient,
  tenantId: string,
  userId: string,
) {
  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const integrations = await getAccessibleGoogleAdsIntegrations(
    serviceClient,
    tenantId,
    userId,
  );
  const isConnected = integrations.length > 0;
  const primary = integrations[0];
  const primarySettings = asRecord(primary?.settings);
  const isExpired = isTokenExpired(primary?.settings);

  return new Response(
    JSON.stringify({
      is_connected: isConnected,
      is_expired: isExpired,
      connected_at: primarySettings.connected_at,
      expires_at: primarySettings.expires_at,
      integration_count: integrations.length,
    }),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}
