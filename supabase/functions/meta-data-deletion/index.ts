// Meta "Data Deletion Request Callback".
// POST (form field `signed_request`): verify the HMAC-SHA256 signature with the
// app secret, log the request in meta_data_deletion_requests and answer with the
// status URL + confirmation code Meta expects.
// GET ?code=<confirmation_code>: return the stored status for the /data-deletion page.
//
// Note: facebook-auth stores only the user token and the page list in
// tenant_integrations; no Facebook user id is persisted, so there is no row to
// match against `user_id` from the signed request. Tokens are revoked by Meta
// when the app is removed; manual cleanup is handled via privacy@aios.co.il.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const STATUS_PAGE = "https://aios.co.il/data-deletion";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function base64UrlDecode(input: string): Uint8Array {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacSha256(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data),
  );
  return new Uint8Array(sig);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function parseSignedRequest(
  signedRequest: string,
  secret: string,
): Promise<Record<string, unknown> | null> {
  const dot = signedRequest.indexOf(".");
  if (dot <= 0) return null;
  const encodedSig = signedRequest.slice(0, dot);
  const encodedPayload = signedRequest.slice(dot + 1);
  if (!encodedPayload) return null;

  let signature: Uint8Array;
  let payloadText: string;
  try {
    signature = base64UrlDecode(encodedSig);
    payloadText = new TextDecoder().decode(base64UrlDecode(encodedPayload));
  } catch {
    return null;
  }

  const expected = await hmacSha256(secret, encodedPayload);
  if (!timingSafeEqual(signature, expected)) return null;

  try {
    const payload = JSON.parse(payloadText);
    if (!payload || typeof payload !== "object") return null;
    const algorithm = String(
      (payload as Record<string, unknown>).algorithm ?? "",
    ).toUpperCase();
    if (algorithm && algorithm !== "HMAC-SHA256") return null;
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

function newConfirmationCode(): string {
  // Short, URL-safe, unique enough for a human-visible status code.
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

serve(async (req) => {
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
      signedRequest = body?.signed_request ?? null;
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
    return json({ error: (err as Error).message ?? "Unknown error" }, 500);
  }
});
