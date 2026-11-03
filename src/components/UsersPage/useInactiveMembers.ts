import { skipToken, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";

/** Query key prefix of the current organization's inactive members list. */
export const INACTIVE_MEMBERS_KEY = "inactive-members";

/** The current organization's inactive members (reactivatable), with their profile names. */
export function useInactiveMembers() {
  const { tenantId } = useCurrentTenant();
  return useQuery({
    queryKey: [INACTIVE_MEMBERS_KEY, tenantId],
    queryFn: tenantId ? () => fetchInactiveMembers(tenantId) : skipToken,
  });
}

/** tenant_inactive_members rows with status inactive, newest first. */
async function fetchInactiveMembers(tenantId: string) {
  const { data, error } = await supabase
    .from("tenant_inactive_members")
    .select("user_id, changed_at, profiles(full_name, email)")
    .eq("tenant_id", tenantId)
    .eq("status", "inactive")
    .order("changed_at", { ascending: false });
  if (error) {
    throw error;
  }
  return data ?? [];
}
