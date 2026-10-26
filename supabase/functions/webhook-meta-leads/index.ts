import {
  asObject,
  thrownMessage,
  type UnknownObject,
} from "../_shared/lead-json.ts";
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

interface ParsedLead {
  name?: string;
  company_name?: string;
  contact_name?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  form_name?: string;
  campaign_name?: string;
  ad_name?: string;
  leadgen_id?: string;
  raw?: unknown;
}

/** Payload text: strings as-is, numbers stringified, anything else absent. */
function optionalText(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  return typeof value === "number" ? String(value) : undefined;
}

/** `a || b || ""` over payload values, as text. */
function firstText(...values: unknown[]): string {
  return optionalText(values.find(Boolean)) ?? "";
}

const asList = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

function extractLeads(rawBody: unknown): ParsedLead[] {
  const leads: ParsedLead[] = [];

  // Format 1: Unified.to webhook format (array of leads)
  if (Array.isArray(rawBody)) {
    for (const item of rawBody) {
      leads.push(parseLeadItem(item));
    }
    return leads;
  }

  const body = asObject(rawBody);
  if (!body) return leads;

  // Format 2: Unified.to single lead
  if (body.id && (body.emails || body.telephones || body.name)) {
    leads.push(parseUnifiedLead(body));
    return leads;
  }

  // Format 3: Meta direct webhook format
  if (body.entry) {
    for (const entry of asList(body.entry)) {
      for (const rawChange of asList(asObject(entry)?.changes)) {
        const change = asObject(rawChange);
        if (change?.field === "leadgen" && change.value) {
          const value = asObject(change.value);
          leads.push({
            leadgen_id: optionalText(value?.leadgen_id),
            form_name: optionalText(value?.form_id),
            campaign_name: optionalText(value?.ad_id),
            raw: change.value,
          });
        }
      }
    }
    return leads;
  }

  // Format 4: Make.com / generic format
  if (body.data && Array.isArray(body.data)) {
    for (const item of body.data) {
      leads.push(parseLeadItem(item));
    }
    return leads;
  }

  // Format 5: Single lead object
  if (body.email || body.phone || body.name || body.contact_name) {
    leads.push(parseLeadItem(body));
    return leads;
  }

  // Format 6: Wrapped in 'lead' key
  if (body.lead) {
    leads.push(parseLeadItem(body.lead));
    return leads;
  }

  return leads;
}

function parseUnifiedLead(item: UnknownObject): ParsedLead {
  return {
    name: firstText(item.name, item.company_name),
    contact_name: firstText(item.name),
    email: Array.isArray(item.emails)
      ? optionalText(asObject(item.emails[0])?.email)
      : optionalText(item.email),
    phone: Array.isArray(item.telephones)
      ? optionalText(asObject(item.telephones[0])?.telephone)
      : optionalText(item.phone),
    company_name: firstText(item.company_name, item.company),
    raw: item,
  };
}

function parseLeadItem(rawItem: unknown): ParsedLead {
  const item: UnknownObject = asObject(rawItem) ?? {};
  return {
    name: firstText(item.name, item.company_name, item.full_name),
    contact_name: firstText(item.contact_name, item.full_name, item.name),
    full_name: firstText(item.full_name, item.name),
    email: firstText(item.email, item.Email, item.EMAIL),
    phone: firstText(item.phone, item.Phone, item.PHONE, item.phone_number),
    company_name: firstText(
      item.company_name,
      item.company,
      item.business_name,
    ),
    form_name: firstText(item.form_name, item.form_id),
    campaign_name: firstText(item.campaign_name, item.campaign_id),
    ad_name: firstText(item.ad_name, item.ad_id),
    leadgen_id: firstText(item.leadgen_id, item.id),
    raw: rawItem,
  };
}

function buildLeadNotes(lead: ParsedLead): string {
  const parts: string[] = ["מקור: Meta Lead Ads"];
  if (lead.form_name) parts.push(`טופס: ${lead.form_name}`);
  if (lead.campaign_name) parts.push(`קמפיין: ${lead.campaign_name}`);
  if (lead.ad_name) parts.push(`מודעה: ${lead.ad_name}`);
  if (lead.leadgen_id) parts.push(`leadgen_id: ${lead.leadgen_id}`);
  return parts.join("\n");
}
