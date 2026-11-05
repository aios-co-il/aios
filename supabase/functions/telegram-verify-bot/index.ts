// Connects a tenant's Telegram bot: checks the token with Telegram, then saves
// the bot as the caller, so only the owner of the caller's active tenant, or a
// super admin acting in it, can.
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2/cors";
import { liveVerifyBotDeps } from "./deps.ts";
import { handleVerifyBot } from "./handler.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return handleVerifyBot(req, liveVerifyBotDeps());
});
