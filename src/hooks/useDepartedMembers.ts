import { skipToken, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import {
  type DepartedMember,
  fetchDepartedMembers,
} from "@/lib/departedMembers";

/** Query key prefix of the organization's inactive and deleted members; member-admin mutations invalidate it. */
export const MEMBER_STATUSES_KEY = "member-statuses";

/** The current organization's inactive and deleted members, by user id. */
export function useDepartedMembers() {
  const { tenantId } = useCurrentTenant();
  return useQuery({
    queryKey: [MEMBER_STATUSES_KEY, tenantId],
    queryFn: tenantId
      ? async () =>
          new Map(
            (await fetchDepartedMembers(supabase, [tenantId])).map(
              (member): [string, DepartedMember] => [member.userId, member],
            ),
          )
      : skipToken,
    staleTime: 5 * 60 * 1000,
  });
}
