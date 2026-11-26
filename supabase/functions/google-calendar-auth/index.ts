import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { allowedAppOrigin } from "../_shared/google-oauth/app-origin.ts";
import {
  isCompleteRefusal,
  readCompleteRequest,
} from "../_shared/google-oauth/connect-handoff.ts";
import { popupCallbackResponse } from "../_shared/google-oauth/popup-handoff.ts";
import {
  oauthStateSecret,
  signOAuthState,
} from "../_shared/google-oauth/oauth-state.ts";
import { userFacingMessage } from "../_shared/google-oauth/user-facing-error.ts";
import { serviceClient } from "../_shared/supabase-clients.ts";
import { buildCalendarAuthorizeUrl } from "./authorize-url.ts";
import { storeCalendarConnection } from "./store-connection.ts";
import { callbackUri } from "../_shared/google-oauth/exchange-code.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const queryAction = url.searchParams.get("action");

    // For OAuth callback, action comes from URL
    if (queryAction === "callback") {
      return await popupCallbackResponse("google-calendar-auth", url, {
        requireTenant: false,
      });
    }

    // For all other actions, require authentication
    const authHeader =
      req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader) {
      console.error("No authorization header provided");
      throw new Error("No authorization header provided");
    }

    // Verify user with anon key
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      },
    );

    const {
      data: { user },
      error: userError,
    } = await anonClient.auth.getUser();
    if (userError || !user) {
      console.error("Auth error:", userError);
      throw new Error("Unauthorized - user not authenticated");
    }

    // calendar_tokens is server-only; every query below filters by this user.
    const tokensClient = serviceClient();

    // Handle disconnect (DELETE method or action: 'disconnect')
    if (req.method === "DELETE") {
      const { error: deleteError } = await tokensClient
        .from("calendar_tokens")
        .delete()
        .eq("user_id", user.id);

      if (deleteError) {
        console.error("Delete error:", deleteError);
        throw deleteError;
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

      await storeCalendarConnection(request.code, request.state.userId);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle disconnect via action (for POST requests from supabase.functions.invoke)
    if (action === "disconnect") {
      const { error: deleteError } = await tokensClient
        .from("calendar_tokens")
        .delete()
        .eq("user_id", user.id);

      if (deleteError) {
        console.error("Delete error:", deleteError);
        throw deleteError;
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");

    // Initial auth request - redirect to Google
    if (action === "init") {
      if (!clientId) {
        console.error("GOOGLE_CLIENT_ID is missing!");
        throw new Error("Missing GOOGLE_CLIENT_ID secret");
      }

      // Consent (and so a new refresh_token) is skipped only when the stored one
      // can be reused: a reconnect without consent gets no refresh_token, and
      // complete reuses the stored one only for the same, known Google account.
      // A token marked needs_reconnect stopped working, so it is never reused.
      const { data: existingToken, error: existingTokenError } =
        await tokensClient
          .from("calendar_tokens")
          .select("refresh_token, google_email, needs_reconnect")
          .eq("user_id", user.id)
          .maybeSingle();
      if (existingTokenError) {
        throw new Error(
          `calendar_tokens lookup failed: ${existingTokenError.message}`,
        );
      }
      const canReuseRefresh =
        !!existingToken?.refresh_token &&
        !!existingToken.google_email &&
        !existingToken.needs_reconnect;

      const authUrl = buildCalendarAuthorizeUrl({
        clientId,
        redirectUri: callbackUri("google-calendar-auth", "callback"),
        state: await signOAuthState(
          {
            userId: user.id,
            tenantId: null,
            origin: allowedAppOrigin(req.headers.get("origin")),
            addNew: false,
          },
          oauthStateSecret(),
        ),
        forceConsent: !canReuseRefresh,
      });

      return new Response(JSON.stringify({ authUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check connection status
    if (action === "status") {
      const { data: tokenData, error: statusError } = await tokensClient
        .from("calendar_tokens")
        .select("google_email")
        .eq("user_id", user.id)
        .maybeSingle();
      if (statusError) {
        throw new Error(
          `calendar_tokens status failed: ${statusError.message}`,
        );
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

    throw new Error("Invalid action");
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: userFacingMessage(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
