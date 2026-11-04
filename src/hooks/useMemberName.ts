import { useCallback } from "react";
import { skipToken, useQuery } from "@tanstack/react-query";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import {
  type DepartedMember,
  departedMemberName,
  fetchDepartedMembers,
} from "@/lib/departedMembers";
import { formatMemberName, type NamedProfile } from "@/lib/memberName";

/** Query key prefix of the organization's inactive and deleted members; member-admin mutations invalidate it. */
export const MEMBER_STATUSES_KEY = "member-statuses";

/** Formats a history row's writer: their user id, the profile embedded in the row, and an optional fallback. */
export type MemberNameFormatter = (
  userId: string | null | undefined,
  profile: NamedProfile | null | undefined,
  fallback?: string,
) => string;

/** The current organization's inactive and deleted members, by user id. */
export function useDepartedMembers() {
  const { tenantId } = useCurrentTenant();
  return useQuery({
    queryKey: [MEMBER_STATUSES_KEY, tenantId],
    queryFn: tenantId
      ? async () =>
          new Map(
            (await fetchDepartedMembers([tenantId])).map(
              (member): [string, DepartedMember] => [member.userId, member],
            ),
          )
      : skipToken,
    staleTime: 5 * 60 * 1000,
  });
}

/** The writer-name formatter for the current organization's history views. */
export function useMemberName(): MemberNameFormatter {
  const { data: departed } = useDepartedMembers();
  return useCallback(
    (userId, profile, fallback) => {
      const member = userId ? departed?.get(userId) : undefined;
      return member
        ? departedMemberName(member, profile, fallback)
        : formatMemberName(profile, undefined, fallback);
    },
    [departed],
  );
}
