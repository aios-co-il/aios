import type { AgentDatabaseClient } from "../database-contracts.ts";

import { leadUpdateFields, type LeadFields } from "./lead-update-fields.ts";

type LeadRequest =
  | { name: "create_lead"; args: LeadFields & { contact_name: string } }
  | { name: "list_leads"; args: { status?: string; limit?: number } }
  | { name: "update_lead_status"; args: { lead_id: string; status: string } }
  | { name: "add_lead_update"; args: { lead_id: string; content: string } }
  | { name: "update_lead"; args: LeadFields & { lead_id: string } }
  | { name: "delete_lead"; args: { lead_id: string } };

interface LeadToolContext {
  supabase: AgentDatabaseClient;
  tenantId: string;
  userId: string | null;
  accessibleTenantIds: Array<string>;
}

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
      const updates = leadUpdateFields(args);
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
