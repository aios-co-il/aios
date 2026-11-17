// Receives every lead form sent from the landing-pages app (AIO-604) and delivers it where the
// page's settings say: the org's CRM, the page's webhook, or both. The app authenticates with the
// shared LANDING_LEAD_INTAKE_SECRET; the org and client come from the page's site row, never from
// the request.
import { timingSafeEqual } from "../_shared/security.ts";
import { serviceClient } from "../_shared/supabase-clients.ts";
import { deliverLead } from "./deliver.ts";
import { findLandingPage } from "./landing-page.ts";
import { parseLandingLead } from "./parse-lead.ts";
import { leadStore } from "./lead-store.ts";

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return reply({ error: "method_not_allowed" }, 405);
  }
  if (!isAuthorised(request)) {
    return reply({ error: "unauthorized" }, 401);
  }

  const lead = parseLandingLead(await request.json().catch(() => null));
  if (!lead) {
    console.error("landing-lead-intake: rejected an invalid lead body");
    return reply({ error: "invalid" }, 400);
  }

  const db = serviceClient();
  const page = await findLandingPage(db, lead.subdomain, lead.slug);
  if (!page) {
    console.error(
      `landing-lead-intake: no page for ${lead.subdomain}/${lead.slug}`,
    );
    return reply({ error: "unknown_page" }, 404);
  }

  const outcome = await deliverLead(page, lead, {
    store: leadStore(db),
    fetch,
    supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
    crmIntakeSecret: Deno.env.get("WEBHOOK_LEAD_INTAKE_SECRET") ?? "",
  });
  if (outcome === "not_configured") {
    return reply({ error: "not_configured" }, 503);
  }
  if (outcome === "failed") {
    return reply({ error: "upstream" }, 502);
  }
  return reply({ ok: true });
});

/** True when the caller sent the shared secret; an unset secret refuses everyone. */
function isAuthorised(request: Request): boolean {
  const expected = Deno.env.get("LANDING_LEAD_INTAKE_SECRET") ?? "";
  const supplied = request.headers.get("x-landing-secret") ?? "";
  return expected.length > 0 && timingSafeEqual(supplied, expected);
}

/** A JSON response that is never cached. */
function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
