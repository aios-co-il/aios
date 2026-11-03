import { useCallback } from "react";
import { skipToken, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import {
  formatMemberName,
  type MemberStatus,
  memberStatusOf,
  type NamedProfile,
} from "@/lib/memberName";

/** Query key prefix of the organization's inactive and deleted members; member-admin mutations invalidate it. */
export const MEMBER_STATUSES_KEY = "member-statuses";

/** Formats a history row's writer: their user id, the profile embedded in the row, and an optional fallback. */
export type MemberNameFormatter = (
  userId: string | null | undefined,
  profile: Partial<NamedProfile> | null | undefined,
  fallback?: string,
) => string;

/** Who is inactive or deleted in the current organization, by user id. */
export function useMemberStatuses() {
  const { tenantId } = useCurrentTenant();
  return useQuery({
    queryKey: [MEMBER_STATUSES_KEY, tenantId],
    queryFn: tenantId ? () => fetchMemberStatuses(tenantId) : skipToken,
    staleTime: 5 * 60 * 1000,
  });
}

/** The writer-name formatter for the current organization's history views. */
export function useMemberName(): MemberNameFormatter {
  const { data: statuses } = useMemberStatuses();
  return useCallback(
    (userId, profile, fallback) =>
      formatMemberName(
        profile,
        userId ? statuses?.get(userId) : undefined,
        fallback,
      ),
    [statuses],
  );
}

/** tenant_inactive_members of one organization as user id → status. */
async function fetchMemberStatuses(
  tenantId: string,
): Promise<Map<string, MemberStatus>> {
  const { data, error } = await supabase
    .from("tenant_inactive_members")
    .select("user_id, status")
    .eq("tenant_id", tenantId);
  if (error) {
    throw error;
  }
  return new Map(
    (data ?? []).flatMap((row) => {
      const status = memberStatusOf(row.status);
      return status ? [[row.user_id, status] as const] : [];
    }),
  );
}
