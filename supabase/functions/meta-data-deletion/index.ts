// Meta "Data Deletion Request Callback".
// POST (form field `signed_request`): verify the HMAC-SHA256 signature with the
// app secret, log the request in meta_data_deletion_requests and answer with the
// status URL + confirmation code Meta expects.
// GET ?code=<confirmation_code>: return the stored status for the /data-deletion page.
//
// Note: facebook-auth stores only the user token and the page list in
// tenant_integrations; no Facebook user id is persisted, so there is no row to
// match against `user_id` from the signed request. Tokens are revoked by Meta
// when the app is removed; the logged request is processed manually (see
// /data-deletion and privacy@afterlead.com).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { corsHeaders } from "../_shared/cors.ts";
import { parseSignedRequest } from "../_shared/meta-signed-request.ts";

// Same convention as google-*-auth and trigger-automation: APP_URL is the
// per-environment site origin; production is the fallback.
const APP_BASE = (Deno.env.get("APP_URL") || "https://aios.co.il").replace(
  /\/+$/,
  "",
);
const STATUS_PAGE = `${APP_BASE}/data-deletion`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function newConfirmationCode(): string {
  // Short, URL-safe, unique enough for a human-visible status code.
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Status lookup used by the /data-deletion page.
    if (req.method === "GET") {
      const code = new URL(req.url).searchParams.get("code")?.trim();
      if (!code) return json({ error: "code is required" }, 400);

      const { data, error } = await supabase
        .from("meta_data_deletion_requests")
        .select("confirmation_code, status, created_at")
        .eq("confirmation_code", code)
        .maybeSingle();

      if (error) throw error;
      if (!data) return json({ error: "Unknown confirmation code" }, 404);
      return json(data);
    }

    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const appSecret =
      Deno.env.get("FACEBOOK_APP_SECRET") ?? Deno.env.get("META_APP_SECRET");
    if (!appSecret) {
      console.error("meta-data-deletion: app secret not configured");
      return json({ error: "Not configured" }, 500);
    }

    // Meta posts application/x-www-form-urlencoded; accept JSON too for tests.
    let signedRequest: string | null = null;
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => null);
      signedRequest =
        typeof body?.signed_request === "string" ? body.signed_request : null;
    } else {
      const form = await req.formData().catch(() => null);
      const value = form?.get("signed_request");
      signedRequest = typeof value === "string" ? value : null;
    }
    if (!signedRequest) {
      return json({ error: "signed_request is required" }, 400);
    }

    const payload = await parseSignedRequest(signedRequest, appSecret);
    if (!payload) {
      return json({ error: "Invalid signed_request" }, 400);
    }

    const fbUserId = payload.user_id != null ? String(payload.user_id) : null;
    const confirmationCode = newConfirmationCode();

    const { error: insertError } = await supabase
      .from("meta_data_deletion_requests")
      .insert({
        fb_user_id: fbUserId,
        confirmation_code: confirmationCode,
        status: "received",
        payload,
      });
    if (insertError) throw insertError;

    // No Facebook user id is stored on tenant_settings / tenant_integrations
    // (see header comment), so there is nothing to match and delete here.

    return json({
      url: `${STATUS_PAGE}?code=${confirmationCode}`,
      confirmation_code: confirmationCode,
    });
  } catch (err) {
    console.error("meta-data-deletion error:", err);
    return json({ error: "Internal error" }, 500);
  }
});
