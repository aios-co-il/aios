import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** The tenant's users with display names, sorted by name. */
export function useTenantAgents(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["pbx-tenant-users", tenantId],
    queryFn: async () => {
      const { data: tu } = await supabase
        .from("tenant_users")
        .select("user_id")
        .eq("tenant_id", tenantId!);
      const ids = (tu || []).map((r) => r.user_id);
      if (!ids.length) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      return (profiles || []).sort((a, b) =>
        (a.full_name || a.email || "").localeCompare(
          b.full_name || b.email || "",
        ),
      );
    },
    enabled: !!tenantId,
  });
}
