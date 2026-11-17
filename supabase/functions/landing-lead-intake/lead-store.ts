import type { DbClient } from "../_shared/supabase-clients.ts";
import type { LeadStore } from "./deliver.ts";

/** The database side of a lead delivery: the landing_leads record and the page's webhook URL. */
export function leadStore(db: DbClient): LeadStore {
  return {
    async record(page, lead) {
      const { data, error } = await db
        .from("landing_leads")
        .insert({
          tenant_id: page.tenantId,
          page_id: page.id,
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
        })
        .select("id")
        .single();
      if (error) {
        throw error;
      }
      return data.id;
    },

    async finish(page, leadId, result) {
      const { error } = await db
        .from("landing_leads")
        .update({
          crm_status: result.crm,
          webhook_status: result.webhook,
          error: result.errors.join("; ") || null,
        })
        .eq("tenant_id", page.tenantId)
        .eq("id", leadId);
      if (error) {
        throw error;
      }
    },

    async webhookUrl(page) {
      const { data, error } = await db
        .from("landing_page_webhooks")
        .select("url")
        .eq("tenant_id", page.tenantId)
        .eq("page_id", page.id)
        .maybeSingle();
      if (error) {
        throw error;
      }
      return data?.url ?? null;
    },
  };
}
