import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { Database, TablesInsert } from "../_shared/database.types.ts";
import { asJsonObject } from "../_shared/lead-json.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

  try {
    const { page_id, form_id, tenant_id } = await req.json();

    // Step 1: Find the integration
    const { data: integrations, error: intError } = await supabase
      .from("tenant_integrations")
      .select("*")
      .eq("integration_type", "facebook_lead_ads")
      .eq("is_active", true);

    if (intError) {
      console.error("Error finding integrations:", intError);
      return new Response(
        JSON.stringify({
          error: "Failed to find integrations",
          details: intError,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    integrations?.forEach((i, idx) => {
      const settings = asJsonObject(i.settings);
      console.log("Integration:", {
        id: i.id,
        tenant_id: i.tenant_id,
        page_id: settings?.page_id,
        has_api_key: !!i.api_key,
        shared_from: i.shared_from_integration_id,
      });
    });

    // Find matching integration by page_id
    let integration = integrations?.find((i) => {
      const settings = asJsonObject(i.settings);
      return settings?.page_id === page_id?.toString();
    });

    if (!integration && tenant_id) {
      // Try to find by tenant_id
      integration = integrations?.find((i) => i.tenant_id === tenant_id);
    }

    if (!integration) {
      return new Response(
        JSON.stringify({
          error: "No matching integration found",
          searched_page_id: page_id,
          available_integrations: integrations?.map((i) => ({
            id: i.id,
            tenant_id: i.tenant_id,
            page_id: asJsonObject(i.settings)?.page_id,
          })),
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let accessToken = integration.api_key;
    const settings = asJsonObject(integration.settings);

    // Check for shared connection
    if (integration.shared_from_integration_id && !accessToken) {
      const { data: sourceIntegration } = await supabase
        .from("tenant_integrations")
        .select("api_key")
        .eq("id", integration.shared_from_integration_id)
        .eq("is_active", true)
        .maybeSingle();

      if (sourceIntegration?.api_key) {
        accessToken = sourceIntegration.api_key;
      }
    }

    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: "No access token available" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Step 2: Check form mappings
    const formMappings = asJsonObject(settings?.form_mappings) ?? {};

    const specificFormMapping = form_id
      ? asJsonObject(formMappings[form_id])
      : null;
    const mappedAgencyId = specificFormMapping?.agency_id;

    // Step 3: Create a fake lead record
    // IMPORTANT: Use the tenant_id from the request, not from the integration
    // This ensures test leads go to the correct tenant (e.g., Nexus Capital, not MarketingCaptain)
    const targetTenantId = tenant_id || integration.tenant_id;

    const fakeLeadgenId = `test_${Date.now()}`;
    const leadRecord: TablesInsert<"leads"> = {
      company_name: `Test Lead ${new Date().toLocaleTimeString()}`,
      contact_name: "Test Contact",
      email: "test@example.com",
      phone: "0501234567",
      source: "paid_ads",
      status: "new",
      tenant_id: targetTenantId,
      agency_id:
        typeof mappedAgencyId === "string" && mappedAgencyId
          ? mappedAgencyId
          : null,
      notes: `Test Facebook Lead\nFake Leadgen ID: ${fakeLeadgenId}\nForm ID: ${form_id || "not specified"}`,
    };

    const { data: newLead, error: insertError } = await supabase
      .from("leads")
      .insert(leadRecord)
      .select("id")
      .single();

    if (insertError) {
      console.error("Error inserting lead:", insertError);
      return new Response(
        JSON.stringify({
          error: "Failed to insert lead",
          details: insertError,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Update last_sync_at
    await supabase
      .from("tenant_integrations")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("id", integration.id);

    return new Response(
      JSON.stringify({
        success: true,
        lead_id: newLead.id,
        integration_id: integration.id,
        tenant_id: integration.tenant_id,
        agency_id: leadRecord.agency_id,
        message: "Test lead created successfully! Check the Leads page.",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: unknown) {
    console.error("Error in test-facebook-lead-webhook:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
