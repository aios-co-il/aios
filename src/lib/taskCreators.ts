import { supabase } from "@/integrations/supabase/client";
import { formatMemberName, memberStatusOf } from "@/lib/memberName";

/**
 * Adds each task's creator name, marked "(נמחק)" or "(לא פעיל)" when the
 * creator left the task's organization (tenant_inactive_members).
 */
export async function withTaskCreatorNames<
  T extends { created_by?: string | null },
>(rows: T[]): Promise<(T & { creator_name: string | null })[]> {
  const creatorIds = Array.from(
    new Set(
      rows
        .map((row) => row.created_by)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  if (creatorIds.length === 0) {
    return rows.map((row) => ({ ...row, creator_name: null }));
  }
  const [{ data: creators }, { data: departed, error: departedError }] =
    await Promise.all([
      supabase.from("profiles").select("id, full_name").in("id", creatorIds),
      supabase
        .from("tenant_inactive_members")
        .select("tenant_id, user_id, status")
        .in("user_id", creatorIds),
    ]);
  if (departedError) {
    console.error(
      "Task creators: inactive members lookup failed",
      departedError,
    );
  }
  const names = new Map(
    (creators || []).map((creator) => [creator.id, creator.full_name]),
  );
  return rows.map((row) => {
    const creatorId = row.created_by;
    if (!creatorId) {
      return { ...row, creator_name: null };
    }
    const left = (departed || []).find(
      (m) => m.user_id === creatorId && m.tenant_id === tenantOf(row),
    );
    const status = left ? memberStatusOf(left.status) : undefined;
    const name = names.get(creatorId);
    return {
      ...row,
      creator_name:
        name || status ? formatMemberName({ full_name: name }, status) : null,
    };
  });
}

/** The task's tenant_id when the row carries one (task rows from `select("*")` do). */
function tenantOf(row: object): unknown {
  return "tenant_id" in row ? row.tenant_id : undefined;
}
