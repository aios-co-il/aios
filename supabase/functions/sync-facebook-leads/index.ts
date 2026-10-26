import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { asObject, type UnknownObject } from "../_shared/lead-json.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type LeadRecordValue = string | null | Record<string, string>;

const nonEmptyStringOrNull = (value: unknown): string | null =>
  typeof value === "string" && value ? value : null;

/** sales_person_ids, or the legacy single sales_person_id, as ids. */
function salesPersonIdsOf(formMapping: UnknownObject): string[] {
  const ids = formMapping.sales_person_ids || formMapping.sales_person_id;
  const list = Array.isArray(ids) ? ids : ids ? [ids] : [];
  return list.filter((id): id is string => typeof id === "string");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { tenant_id, integration_id, form_id, since_date, days, preview } =
      await req.json();

    if (!tenant_id) {
      return new Response(JSON.stringify({ error: "tenant_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Preview returns the form's leads straight from Facebook and writes
    // nothing. It returns lead data, so the caller must be able to see the
    // integration under RLS.
    if (preview) {
      if (!integration_id || !form_id) {
        return new Response(
          JSON.stringify({
            error: "integration_id and form_id are required for preview",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      const callerClient = createClient(
        supabaseUrl,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        {
          global: {
            headers: { Authorization: req.headers.get("Authorization") ?? "" },
          },
        },
      );
      const { data: visible } = await callerClient
        .from("tenant_integrations")
        .select("id")
        .eq("id", integration_id)
        .maybeSingle();
      if (!visible) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    const previewLeads: Array<{
      leadgen_id: string;
      form_id: string;
      created_time: string;
      field_data: Record<string, string>;
    }> = [];

    // Get Facebook integrations for this tenant (both own and shared)
    let query = supabase
      .from("tenant_integrations")
      .select("*")
      .eq("integration_type", "facebook_lead_ads")
      .eq("is_active", true);

    if (integration_id) {
      query = query.eq("id", integration_id);
    } else {
      query = query.eq("tenant_id", tenant_id);
    }

    const { data: integrations, error: intError } = await query;

    if (intError) {
      console.error("Error fetching integrations:", intError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch integrations" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!integrations || integrations.length === 0) {
      return new Response(
        JSON.stringify({ error: "No Facebook integrations found", synced: 0 }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let totalSynced = 0;
    let totalSkipped = 0;
    const errors: string[] = [];

    // Compute since timestamp (unix seconds)
    let sinceSec: number;
    if (since_date) {
      sinceSec = Math.floor(new Date(since_date).getTime() / 1000);
    } else if (days && Number.isFinite(days)) {
      sinceSec = Math.floor(
        (Date.now() - Number(days) * 24 * 60 * 60 * 1000) / 1000,
      );
    } else {
      sinceSec = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
    }

    for (const integration of integrations) {
      let accessToken = integration.api_key;
      const settings = asObject(integration.settings);

      // Check for shared connection
      if (integration.shared_from_integration_id) {
        const { data: sourceIntegration } = await supabase
          .from("tenant_integrations")
          .select("api_key")
          .eq("id", integration.shared_from_integration_id)
          .single();

        if (sourceIntegration?.api_key) {
          accessToken = sourceIntegration.api_key;
        }
      }

      if (!accessToken) {
        errors.push(`Integration ${integration.id}: No access token`);
        continue;
      }

      const formMappings: UnknownObject =
        asObject(settings?.form_mappings) ?? {};

      // Build the list of forms to sync.
      // If form_id explicitly provided, sync only it (even if not in mappings — use empty mapping).
      let formsToProcess: Array<[string, unknown]>;
      if (form_id) {
        formsToProcess = [[form_id, formMappings[form_id] || {}]];
      } else {
        formsToProcess = Object.entries(formMappings);
        if (formsToProcess.length === 0) continue;
      }

      // Process each form
      for (const [formId, mapping] of formsToProcess) {
        const formMapping: UnknownObject = asObject(mapping) ?? {};

        try {
          // Fetch leads from Facebook using computed since
          const leadsUrl = `https://graph.facebook.com/v21.0/${formId}/leads?access_token=${accessToken}&filtering=[{"field":"time_created","operator":"GREATER_THAN","value":${sinceSec}}]&limit=500`;

          const leadsResponse = await fetch(leadsUrl);
          const leadsData = await leadsResponse.json();

          if (leadsData.error) {
            console.error(
              "Facebook API error for form",
              formId,
              ":",
              leadsData.error,
            );
            errors.push(`Form ${formId}: ${leadsData.error.message}`);
            continue;
          }

          const leads = leadsData.data || [];

          for (const lead of leads) {
            const leadgenId = lead.id;

            // Parse lead fields early to check for duplicates
            const fieldData: Record<string, string> = {};
            for (const field of lead.field_data || []) {
              fieldData[field.name] = field.values?.[0] || "";
            }

            if (preview) {
              previewLeads.push({
                leadgen_id: leadgenId,
                form_id: formId,
                created_time: lead.created_time,
                field_data: fieldData,
              });
              continue;
            }

            const leadPhone = fieldData.phone_number || fieldData.phone || "";
            const leadEmail = fieldData.email || "";

            // Check if this lead already exists by leadgen_id
            const { data: existingByLeadgenId } = await supabase
              .from("leads")
              .select("id")
              .eq("tenant_id", integration.tenant_id)
              .ilike("notes", `%${leadgenId}%`)
              .maybeSingle();

            if (existingByLeadgenId) {
              totalSkipped++;
              continue;
            }

            // Check by phone number (normalize to last 9 digits)
            if (leadPhone) {
              const normalizedPhone = leadPhone.replace(/\D/g, "").slice(-9);
              if (normalizedPhone.length >= 9) {
                const { data: existingByPhone } = await supabase
                  .from("leads")
                  .select("id, phone")
                  .eq("tenant_id", integration.tenant_id)
                  .not("phone", "is", null);

                const phoneMatch = existingByPhone?.find((l) => {
                  const existingNormalized = (l.phone || "")
                    .replace(/\D/g, "")
                    .slice(-9);
                  return existingNormalized === normalizedPhone;
                });

                if (phoneMatch) {
                  totalSkipped++;
                  continue;
                }
              }
            }

            // Check by email
            if (leadEmail) {
              const { data: existingByEmail } = await supabase
                .from("leads")
                .select("id")
                .eq("tenant_id", integration.tenant_id)
                .ilike("email", leadEmail)
                .maybeSingle();

              if (existingByEmail) {
                totalSkipped++;
                continue;
              }
            }

            // Map fields based on form mapping (fieldData already parsed above)

            // Map fields based on form mapping
            const fieldMappings = asObject(formMapping.fields) ?? {};

            // Support both legacy single and new multi-select salesperson
            const salesPersonIds = salesPersonIdsOf(formMapping);

            const leadRecord: Record<string, LeadRecordValue> = {
              company_name:
                fieldData.company ||
                fieldData.full_name ||
                fieldData.first_name ||
                "Facebook Lead",
              source: "paid_ads",
              status: "new",
              tenant_id: integration.tenant_id,
              agency_id: nonEmptyStringOrNull(formMapping.agency_id),
              sales_person_id:
                salesPersonIds.length > 0 ? salesPersonIds[0] : null, // Primary for backwards compatibility
              facebook_form_id: formId,
              facebook_leadgen_id: leadgenId,
              form_data: fieldData,
              // fb_ lines let automation tests resolve {{fb_*}} template fields.
              notes: [
                `Facebook Lead ID: ${leadgenId}`,
                `Form ID: ${formId}`,
                `Source: Facebook Lead Ads`,
                `Created: ${lead.created_time}`,
                ...Object.entries(fieldData)
                  .filter(([, v]) => v)
                  .map(([k, v]) => `fb_${k}: ${v}`),
              ].join("\n"),
            };

            // Apply custom field mappings
            for (const [fbField, systemField] of Object.entries(
              fieldMappings,
            )) {
              if (typeof systemField !== "string") continue;
              if (systemField === "skip" || !systemField) continue;

              const value = fieldData[fbField];
              if (value) {
                if (systemField === "notes") {
                  leadRecord.notes =
                    (leadRecord.notes || "") + `\n${fbField}: ${value}`;
                } else {
                  leadRecord[systemField] = value;
                }
              }
            }

            // Fallback mappings for common fields
            if (!leadRecord.contact_name) {
              leadRecord.contact_name =
                fieldData.full_name ||
                `${fieldData.first_name || ""} ${fieldData.last_name || ""}`.trim() ||
                fieldData.name ||
                null;
            }
            if (!leadRecord.email && fieldData.email) {
              leadRecord.email = fieldData.email;
            }
            if (
              !leadRecord.phone &&
              (fieldData.phone_number || fieldData.phone)
            ) {
              leadRecord.phone = fieldData.phone_number || fieldData.phone;
            }

            // Insert the lead
            const { data: newLead, error: insertError } = await supabase
              .from("leads")
              .insert(leadRecord)
              .select("id")
              .single();

            if (insertError) {
              console.error("Error inserting lead:", insertError);
              errors.push(`Lead ${leadgenId}: ${insertError.message}`);
            } else {
              totalSynced++;

              // Insert into lead_sales_people junction table for multi-salesperson support
              if (salesPersonIds.length > 0) {
                const junctionRecords = salesPersonIds.map((spId) => ({
                  lead_id: newLead.id,
                  sales_person_id: spId,
                  tenant_id: integration.tenant_id,
                }));

                const { error: junctionError } = await supabase
                  .from("lead_sales_people")
                  .insert(junctionRecords);

                if (junctionError) {
                  console.error(
                    "Error inserting lead_sales_people:",
                    junctionError,
                  );
                }
              }

              // Apply tag if configured
              if (formMapping.tag_id) {
                const { error: tagError } = await supabase
                  .from("chat_contact_tags")
                  .insert({
                    tag_id: formMapping.tag_id,
                    lead_id: newLead.id,
                    tenant_id: integration.tenant_id,
                    user_id: "00000000-0000-0000-0000-000000000000", // System user placeholder
                  });

                if (tagError) {
                  console.error("Error applying tag to lead:", tagError);
                }
              }
            }
          }
        } catch (formError) {
          console.error("Error processing form", formId, ":", formError);
          errors.push(
            `Form ${formId}: ${formError instanceof Error ? formError.message : "Unknown error"}`,
          );
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        synced: totalSynced,
        skipped: totalSkipped,
        ...(preview ? { leads: previewLeads } : {}),
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in sync-facebook-leads:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
