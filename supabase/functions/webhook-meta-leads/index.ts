import { thrownMessage } from "../_shared/lead-json.ts";
import { buildLeadNotes, extractLeads } from "./parse-leads.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { resolveTenantHomeAgencyId } from "../_shared/resolve-tenant-agency.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

/**
 * Webhook endpoint for receiving Meta Lead Ads leads.
 * Can be triggered by:
 * 1. Unified.to webhook (when configured)
 * 2. Direct Meta webhook
 * 3. Make.com scenario
 *
 * URL: /functions/v1/webhook-meta-leads?tenant_id=xxx&agency_id=yyy
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // GET for Meta webhook verification (hub.challenge)
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const verifyToken =
      Deno.env.get("META_WEBHOOK_VERIFY_TOKEN") || "marketing-captain-meta";

    if (mode === "subscribe" && token === verifyToken) {
      console.log("Meta webhook verified");
      return new Response(challenge, { status: 200, headers: corsHeaders });
    }

    return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const url = new URL(req.url);
    const tenantId = url.searchParams.get("tenant_id");
    const agencyId = url.searchParams.get("agency_id");
    const source = url.searchParams.get("source") || "paid_ads";

    const rawBody = await req.json();
    console.log(
      "Meta leads webhook received:",
      JSON.stringify(rawBody).substring(0, 500),
    );

    // Normalize: support multiple formats
    const leads = extractLeads(rawBody);

    if (!leads.length) {
      return new Response(
        JSON.stringify({
          error: "No leads found in payload",
          received_keys: Object.keys(rawBody),
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Resolve tenant
    let resolvedTenantId = tenantId;
    let resolvedAgencyId = agencyId;

    if (!resolvedTenantId) {
      // Try to find from first lead's ad account or default
      const { data: defaultTenant } = await supabase
        .from("tenants")
        .select("id")
        .limit(1)
        .single();
      resolvedTenantId = defaultTenant?.id;
    }

    if (!resolvedTenantId) {
      return new Response(JSON.stringify({ error: "tenant_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get default / shared agency if not specified
    if (!resolvedAgencyId) {
      resolvedAgencyId = await resolveTenantHomeAgencyId(
        supabase,
        resolvedTenantId,
      );
    }

    if (!resolvedAgencyId) {
      return new Response(
        JSON.stringify({ error: "No agency found for tenant" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const lead of leads) {
      try {
        // Check for duplicate by phone or email
        const normalizedPhone = normalizePhone(lead.phone);
        let isDuplicate = false;

        if (normalizedPhone) {
          const { data: existingByPhone } = await supabase
            .from("leads")
            .select("id")
            .eq("tenant_id", resolvedTenantId)
            .ilike("phone", `%${normalizedPhone.slice(-9)}%`)
            .limit(1);
          if (existingByPhone?.length) isDuplicate = true;
        }

        if (!isDuplicate && lead.email) {
          const { data: existingByEmail } = await supabase
            .from("leads")
            .select("id")
            .eq("tenant_id", resolvedTenantId)
            .ilike("email", lead.email)
            .limit(1);
          if (existingByEmail?.length) isDuplicate = true;
        }

        if (isDuplicate) {
          skipped++;
          continue;
        }

        // Insert lead
        const { error: insertError } = await supabase.from("leads").insert({
          company_name: lead.name || lead.company_name || "ליד מ-Meta",
          contact_name: lead.contact_name || lead.full_name || lead.name || "",
          email: lead.email || null,
          phone: lead.phone || null,
          source: source,
          campaign_name: lead.campaign_name?.trim() || null,
          agency_id: resolvedAgencyId,
          tenant_id: resolvedTenantId,
          notes: buildLeadNotes(lead),
          status: "new",
        });

        if (insertError) {
          errors.push(`Insert error: ${insertError.message}`);
        } else {
          created++;
        }
      } catch (err) {
        errors.push(`Lead processing error: ${thrownMessage(err)}`);
      }
    }

    console.log(
      `Meta leads webhook: created=${created}, skipped=${skipped}, errors=${errors.length}`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        created,
        skipped,
        total_received: leads.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("webhook-meta-leads error:", error);
    return new Response(JSON.stringify({ error: thrownMessage(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  return phone.replace(/[\s\-().+]/g, "").replace(/^0/, "972");
}
