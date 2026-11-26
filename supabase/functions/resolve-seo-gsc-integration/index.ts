import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  isGscRefusal,
  readClientGscAccess,
} from "../_shared/seo/client-gsc-access.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function normalizeSiteUrl(value?: string | null): string {
  return String(value || "")
    .replace(/^sc-domain:/, "")
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

function siteMatches(a?: string | null, b?: string | null): boolean {
  const na = normalizeSiteUrl(a);
  const nb = normalizeSiteUrl(b);
  if (!na || !nb) {
    return false;
  }
  return na === nb || na.includes(nb) || nb.includes(na);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    const { clientId, expectedSiteUrl } = await req.json();

    // The organizations come from the server-side rule, never from the body:
    // the caller must see the client, and only its organizations count.
    const access = await readClientGscAccess(authHeader, clientId);
    if (isGscRefusal(access)) {
      return new Response(JSON.stringify({ error: access.error }), {
        status: access.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Fetch all active GSC integrations across the accessible tenants.
    const { data: integrations, error: intErr } = await supabase
      .from("tenant_integrations")
      .select("id, settings, user_id, tenant_id")
      .in("tenant_id", access.tenantIds)
      .eq("integration_type", "google_search_console")
      .eq("is_active", true);

    if (intErr) {
      console.error("[resolve-seo-gsc] query error:", intErr);
      return new Response(JSON.stringify({ error: intErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!integrations || integrations.length === 0) {
      return new Response(
        JSON.stringify({
          integrationId: null,
          siteUrl: null,
          ownerEmail: null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    type Candidate = {
      id: string;
      siteUrl: string | null;
      ownerEmail: string | null;
      rank: number;
    };
    const candidates: Array<Candidate> = [];

    for (const i of integrations) {
      const s: any = i.settings || {};
      const clientSites = s.client_sites || {};
      const availableSites: Array<any> = Array.isArray(s.available_sites)
        ? s.available_sites
        : [];
      const ownerEmail: string | null = s.google_email || null;

      const mappedForClient: string | null = clientSites[clientId] || null;
      const isMappingUsable = (siteUrl: string | null) => {
        if (!siteUrl) {
          return false;
        }
        const meta = availableSites.find((x: any) => x?.siteUrl === siteUrl);
        return !meta || meta.permissionLevel !== "siteUnverifiedUser";
      };

      // Tier 1: explicit client mapping AND matches expectedSiteUrl (if provided).
      if (mappedForClient && isMappingUsable(mappedForClient)) {
        if (!expectedSiteUrl || siteMatches(mappedForClient, expectedSiteUrl)) {
          candidates.push({
            id: i.id,
            siteUrl: mappedForClient,
            ownerEmail,
            rank: 1,
          });
          continue;
        }
      }

      // Tier 2: available_sites contains a usable property matching expectedSiteUrl.
      if (expectedSiteUrl) {
        const siteMatch = availableSites.find(
          (x: any) =>
            x?.permissionLevel !== "siteUnverifiedUser" &&
            siteMatches(x?.siteUrl, expectedSiteUrl),
        );
        if (siteMatch?.siteUrl) {
          candidates.push({
            id: i.id,
            siteUrl: siteMatch.siteUrl,
            ownerEmail,
            rank: 2,
          });
          continue;
        }
      }

      // Tier 3: any usable mapping for this client (even if not matching expectedSiteUrl).
      if (mappedForClient && isMappingUsable(mappedForClient)) {
        candidates.push({
          id: i.id,
          siteUrl: mappedForClient,
          ownerEmail,
          rank: 3,
        });
        continue;
      }

      // Tier 4: just an active integration (last resort, no siteUrl).
      candidates.push({ id: i.id, siteUrl: null, ownerEmail, rank: 4 });
    }

    candidates.sort((a, b) => a.rank - b.rank);
    const best = candidates[0];

    return new Response(
      JSON.stringify({
        integrationId: best?.id || null,
        siteUrl: best?.siteUrl || null,
        ownerEmail: best?.ownerEmail || null,
        rank: best?.rank ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[resolve-seo-gsc] error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
