import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Lists, templates and WhatsApp connections the mailing automation actions pick from. */
export function useMailingActionOptions(
  tenantId: string,
  { needsList, needsTemplate }: { needsList: boolean; needsTemplate: boolean },
) {
  const { data: lists = [] } = useQuery({
    // Under the broadcast-lists prefix, so list mutations refresh it too.
    queryKey: ["broadcast-lists", tenantId, "automation-options"],
    enabled: !!tenantId && needsList,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("broadcast_lists")
        .select("id, name, kind, source, member_count")
        .eq("tenant_id", tenantId)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["message-templates", tenantId, "automation-options"],
    enabled: !!tenantId && needsTemplate,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("message_templates")
        .select("id, name, channel")
        .eq("tenant_id", tenantId)
        .is("archived_at", null)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: waIntegrations = [] } = useQuery({
    queryKey: ["automation-wa-integrations", tenantId],
    enabled: !!tenantId && needsTemplate,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_integrations")
        .select("id, integration_type, display_name")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .in("integration_type", ["green_api", "manus_wa"]);
      if (error) throw error;
      return data || [];
    },
  });

  return { lists, templates, waIntegrations };
}

export type MailingOptions = ReturnType<typeof useMailingActionOptions>;
