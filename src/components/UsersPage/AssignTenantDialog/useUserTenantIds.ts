import { skipToken, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const USER_TENANTS_KEY = "user-tenant-ids";

/**
 * The organizations the user is already in, among those the caller can see,
 * so the dialog offers only organizations the user can still join.
 */
export function useUserTenantIds(userId: string | undefined) {
  return useQuery({
    queryKey: [USER_TENANTS_KEY, userId],
    queryFn: userId ? () => fetchUserTenantIds(userId) : skipToken,
  });
}

/** tenant_users rows of the user, as tenant ids. */
async function fetchUserTenantIds(userId: string): Promise<Array<string>> {
  const { data, error } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .eq("user_id", userId);
  if (error) {
    throw error;
  }
  return (data ?? []).map((row) => row.tenant_id);
}
