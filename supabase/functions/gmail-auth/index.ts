import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { tenantUserAccess } from "../_shared/auth/tenant-access.ts";
import { allowedAppOrigin } from "../_shared/google-oauth/app-origin.ts";
import {
  isCompleteRefusal,
  readCompleteRequest,
  refuseFormerMember,
} from "../_shared/google-oauth/connect-handoff.ts";
import { popupHandoffPage } from "../_shared/google-oauth/handoff-response.ts";
import {
  oauthStateSecret,
  signOAuthState,
  verifyOAuthState,
} from "../_shared/google-oauth/oauth-state.ts";
import {
  UserFacingError,
  userFacingMessage,
} from "../_shared/google-oauth/user-facing-error.ts";
import { serviceClient } from "../_shared/supabase-clients.ts";
import { buildGmailAuthorizeUrl } from "./authorize-url.ts";
import { storeGmailConnection } from "./store-connection.ts";
// Gmail OAuth integration v1

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const queryAction = url.searchParams.get("action");
    const hasOAuthCode = !!url.searchParams.get("code");
    const hasOAuthState = !!url.searchParams.get("state");

    // OAuth callback
    if (queryAction === "callback" || (hasOAuthCode && hasOAuthState)) {
      const code = url.searchParams.get("code");
      if (!code) {
        throw new Error("No authorization code provided");
      }

      const state = await verifyOAuthState(
        url.searchParams.get("state"),
        oauthStateSecret(),
      );
      if (!state?.tenantId) {
        throw new UserFacingError(
          "This connect link is invalid or has expired. Close this window and connect Gmail again.",
        );
      }

      return popupHandoffPage(
        "gmail-auth",
        state,
        code,
        url.searchParams.get("state") ?? "",
      );
    }

    // Authenticated actions
    const authHeader =
      req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: userError,
    } = await anonClient.auth.getUser();
    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const requestBody = await req.json();
    const action = requestBody.action;

    if (action === "complete") {
      const request = await readCompleteRequest(requestBody, user.id);
      if (isCompleteRefusal(request)) {
        return new Response(JSON.stringify({ error: request.error }), {
          status: request.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { userId, tenantId } = request.state;
      if (!tenantId) {
        throw new UserFacingError(
          "This connect link is invalid. Connect Gmail again.",
        );
      }

      const refusal = await refuseFormerMember(tenantId, userId);
      if (refusal) {
        return new Response(JSON.stringify({ error: refusal.error }), {
          status: refusal.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await storeGmailConnection(request.code, userId, tenantId);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "init") {
      const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
      if (!clientId) {
        throw new Error("Missing GOOGLE_CLIENT_ID");
      }

      const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/gmail-auth`;
      const tenantId = requestBody.tenantId;
      if (!tenantId) {
        throw new Error("Missing tenantId");
      }

      const access = await tenantUserAccess(serviceClient(), tenantId, user.id);
      if (!access.member && !access.superAdmin) {
        return new Response(
          JSON.stringify({
            error: "You are not a member of this organization",
          }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const authUrl = buildGmailAuthorizeUrl({
        clientId,
        redirectUri,
        state: await signOAuthState(
          {
            userId: user.id,
            tenantId,
            origin: allowedAppOrigin(req.headers.get("origin")),
            addNew: false,
          },
          oauthStateSecret(),
        ),
      });

      return new Response(JSON.stringify({ authUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "status") {
      // gmail_tokens has no user read policy (it holds the OAuth tokens); this returns the address only.
      const { data: tokenData, error: statusError } = await anonClient
        .rpc("get_user_gmail_connection")
        .maybeSingle<{ google_email: string | null }>();
      if (statusError) {
        throw statusError;
      }

      return new Response(
        JSON.stringify({
          connected: !!tokenData,
          google_email: tokenData?.google_email || null,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (action === "disconnect") {
      const serviceClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      );

      const { error } = await serviceClient
        .from("gmail_tokens")
        .delete()
        .eq("user_id", user.id);

      if (error) {
        throw error;
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Invalid action");
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        error: userFacingMessage(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
