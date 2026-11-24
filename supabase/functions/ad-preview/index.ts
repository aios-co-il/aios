// Meta's mobile feed preview of one ad on a Facebook report table, for the
// report page and its share link (the ad preview dialog). verify_jwt is off
// because share link viewers have no session: the body names either the
// table, read as the caller (their JWT, RLS), or an active share token, and
// the ad must be one of that table's ad rows. The Meta token stays here; the
// answer is only the preview iframe address.
import { corsHeaders } from "../_shared/cors.ts";
import { serviceClient, userClient } from "../_shared/supabase-clients.ts";
import type { AdPreviewAnswer } from "./contract.ts";
import { handleAdPreview } from "./handler.ts";
import { adPreviewStore } from "./store.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return reply({ error: "method_not_allowed" }, 405);
  }
  const authorization = request.headers.get("Authorization") ?? "";
  const { status, body } = await handleAdPreview(
    await request.json().catch(() => null),
    {
      store: adPreviewStore(serviceClient(), userClient(authorization)),
      fetch,
    },
  );
  return reply(body, status);
});

/** A JSON response that is never cached. */
function reply(body: AdPreviewAnswer, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
