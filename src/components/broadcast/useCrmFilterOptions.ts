import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import type { CrmListFilter } from "@/components/broadcast/CrmListFilterBuilder";

export const EMPTY_CRM_LIST_FILTER: CrmListFilter = { source: "leads" };

export interface FilterOption {
  value: string;
  label: string;
}

async function fetchNamedRows(
  table: "agencies" | "sales_people",
  tenantId: string,
): Promise<FilterOption[]> {
  if (table === "agencies") {
    const { data, error } = await supabase
      .from("agencies")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .order("name");
    if (error) throw error;
    return (data || []).map((r) => ({ value: r.id, label: r.name || "—" }));
  }
  const { data, error } = await supabase
    .from("sales_people")
    .select("id, full_name")
    .eq("tenant_id", tenantId)
    .order("full_name");
  if (error) throw error;
  return (data || []).map((r) => ({ value: r.id, label: r.full_name || "—" }));
}

/** Agencies or sales people of the current tenant as filter options. */
export function useNamedRows(table: "agencies" | "sales_people") {
  const { tenantId } = useCurrentTenant();
  return useQuery({
    queryKey: ["broadcast-filter-options", table, tenantId],
    enabled: !!tenantId,
    queryFn: () => fetchNamedRows(table, tenantId!),
  });
}

/** Chat tags of the current tenant as filter options. */
export function useChatTags() {
  const { tenantId } = useCurrentTenant();
  return useQuery({
    queryKey: ["broadcast-filter-tags", tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<FilterOption[]> => {
      const { data, error } = await supabase
        .from("chat_tags")
        .select("id, name")
        .eq("tenant_id", tenantId!)
        .order("sort_order");
      if (error) throw error;
      return (data || []).map((t) => ({ value: t.id, label: t.name || "—" }));
    },
  });
}
