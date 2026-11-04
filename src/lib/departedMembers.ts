import { supabase } from "@/integrations/supabase/client";
import {
  formatMemberName,
  type MemberStatus,
  memberStatusOf,
  type NamedProfile,
} from "@/lib/memberName";

/** Someone who left an organization: only their name and status reach the app, never the rest of their profile. */
export type DepartedMember = {
  tenantId: string;
  userId: string;
  fullName: string | null;
  status: MemberStatus;
};

/** Inactive and deleted members of the given organizations that the caller belongs to (tenant_departed_members). */
export async function fetchDepartedMembers(
  tenantIds: ReadonlyArray<string>,
): Promise<Array<DepartedMember>> {
  if (tenantIds.length === 0) {
    return [];
  }
  const { data, error } = await supabase.rpc("tenant_departed_members", {
    p_tenant_ids: [...tenantIds],
  });
  if (error) {
    throw error;
  }
  return (data ?? []).flatMap((row) => {
    const status = memberStatusOf(row.status);
    return status
      ? [
          {
            tenantId: row.tenant_id,
            userId: row.user_id,
            fullName: row.full_name,
            status,
          },
        ]
      : [];
  });
}

/** A departed writer's name with its mark; the profile a row embeds fills in only what the departed record lacks. */
export function departedMemberName(
  member: DepartedMember,
  profile?: NamedProfile | null,
  fallback?: string,
): string {
  return formatMemberName(
    { full_name: member.fullName ?? profile?.full_name, email: profile?.email },
    member.status,
    fallback,
  );
}
