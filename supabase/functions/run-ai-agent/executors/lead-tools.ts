import type { LeadToolContext, LeadRequest } from "./lead-contracts.ts";
import type { TablesUpdate } from "../../_shared/database.types.ts";

/** Executes agency-lead operations after the dispatcher resolves caller scope. */
export async function executeLeadTool(
  request: LeadRequest,
  context: LeadToolContext,
) {
  const { name, args } = request;
  const { supabase, tenantId, userId, accessibleTenantIds } = context;
  switch (name) {
    case "create_lead": {
      const { data: agency } = await supabase
        .from("agencies")
        .select("id")
        .in("tenant_id", accessibleTenantIds)
        .limit(1)
        .single();
      const { data, error } = await supabase
        .from("leads")
        .insert({
          ...args,
          status: "new",
          agency_id: agency?.id,
          tenant_id: tenantId,
          company_name: args.company_name || args.contact_name,
        })
        .select("id, company_name, contact_name, status")
        .single();
      if (error) {
        throw error;
      }
      return {
        lead_id: data.id,
        company_name: data.company_name,
        status: data.status,
      };
    }
    case "list_leads": {
      let query = supabase
        .from("leads")
        .select(
          "id, company_name, contact_name, phone, status, source, created_at",
        )
        .in("tenant_id", accessibleTenantIds)
        .order("created_at", { ascending: false })
        .limit(args.limit || 20);
      if (args.status) {
        query = query.eq("status", args.status);
      }
      const { data, error } = await query;
      if (error) {
        throw error;
      }
      return { count: data.length, leads: data };
    }
    case "update_lead_status": {
      const { data, error } = await supabase
        .from("leads")
        .update({ status: args.status })
        .eq("id", args.lead_id)
        .in("tenant_id", accessibleTenantIds)
        .select("id, company_name, status")
        .single();
      if (error) {
        throw error;
      }
      return data;
    }
    case "add_lead_update": {
      const { data, error } = await supabase
        .from("lead_updates")
        .insert({
          lead_id: args.lead_id,
          user_id: userId,
          tenant_id: tenantId,
          content: args.content,
        })
        .select("id")
        .single();
      if (error) {
        throw error;
      }
      return { update_id: data.id };
    }
    case "update_lead": {
      const updates: TablesUpdate<"leads"> = {};
      if (args.company_name) {
        updates.company_name = args.company_name;
      }
      if (args.contact_name !== undefined) {
        updates.contact_name = args.contact_name;
      }
      if (args.phone !== undefined) {
        updates.phone = args.phone;
      }
      if (args.email !== undefined) {
        updates.email = args.email;
      }
      if (args.source !== undefined) {
        updates.source = args.source;
      }
      if (args.notes !== undefined) {
        updates.notes = args.notes;
      }
      if (args.follow_up_date !== undefined) {
        updates.follow_up_date = args.follow_up_date;
      }
      const { data, error } = await supabase
        .from("leads")
        .update(updates)
        .eq("id", args.lead_id)
        .in("tenant_id", accessibleTenantIds)
        .select("id, company_name, status")
        .single();
      if (error) {
        throw error;
      }
      return data;
    }
    case "delete_lead": {
      const { data, error } = await supabase
        .from("leads")
        .update({ archived_at: new Date().toISOString(), archived_by: null })
        .eq("id", args.lead_id)
        .in("tenant_id", accessibleTenantIds)
        .is("archived_at", null)
        .select("id")
        .maybeSingle();
      if (error) {
        throw error;
      }
      if (!data) {
        throw new Error("הליד לא נמצא או כבר בארכיון");
      }
      return { success: true, archived_id: args.lead_id };
    }
  }
}
