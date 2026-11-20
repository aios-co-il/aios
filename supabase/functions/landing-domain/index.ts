// Connects a landing site's custom domain to the landing-pages Vercel project and reports whether
// Vercel verified it (AIO-607). The settings panel calls it with the user's JWT after saving the
// domain ("connect") and from its check button ("status"). The site and org come from the work
// item through landing_site_of_project, run as the caller; the body names only the item. Vercel is
// called in Production only, with VERCEL_LANDING_TOKEN, VERCEL_LANDING_PROJECT_ID and
// VERCEL_LANDING_TEAM_ID.
import { corsHeaders } from "../_shared/cors.ts";
import { serviceClient, userClient } from "../_shared/supabase-clients.ts";
import { handleLandingDomain } from "./handler.ts";
import { type SiteRef, siteDomainStore } from "./site-store.ts";
import { vercelLandingFromEnv } from "./vercel.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return reply({ error: "method_not_allowed" }, 405);
  }
  const authorization = request.headers.get("Authorization") ?? "";
  const { status, body } = await handleLandingDomain(
    await request.json().catch(() => null),
    {
      vercel: vercelLandingFromEnv((name) => Deno.env.get(name), fetch),
      siteOfProject: (itemId) => siteOfProject(authorization, itemId),
      store: siteDomainStore(serviceClient()),
      now: () => new Date(),
    },
  );
  return reply(body, status);
});

/** The caller's project site, resolved by the database as the caller; its refusal is the error. */
async function siteOfProject(
  authorization: string,
  itemId: string,
): Promise<SiteRef | { error: string }> {
  const { data, error } = await userClient(authorization)
    .rpc("landing_site_of_project", { p_item_id: itemId })
    .maybeSingle();
  if (error || !data) {
    console.error(
      `landing-domain: site of project ${itemId} refused: ${error?.code ?? "none"}`,
    );
    return { error: error?.message || "הפרויקט לא נמצא" };
  }
  return { siteId: data.site_id, tenantId: data.tenant_id };
}

/** A JSON response that is never cached. */
function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
