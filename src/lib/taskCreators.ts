import { supabase } from "@/integrations/supabase/client";
import {
  type DepartedMember,
  departedMemberName,
  fetchDepartedMembers,
} from "@/lib/departedMembers";

/**
 * Adds each task's creator name, marked "(נמחק)" or "(לא פעיל)" when the
 * creator left the task's organization (their name then comes from
 * tenant_departed_members, since their profile is no longer readable).
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
  const tenantIds = Array.from(
    new Set(
      rows.map(tenantOf).filter((id): id is string => typeof id === "string"),
    ),
  );
  const [{ data: creators }, departed] = await Promise.all([
    supabase.from("profiles").select("id, full_name").in("id", creatorIds),
    fetchDepartedMembers(supabase, tenantIds).catch(
      (error: unknown): Array<DepartedMember> => {
        console.error("Task creators: departed members lookup failed", error);
        return [];
      },
    ),
  ]);
  const names = new Map(
    (creators || []).map((creator) => [creator.id, creator.full_name]),
  );
  return rows.map((row) => {
    const creatorId = row.created_by;
    if (!creatorId) {
      return { ...row, creator_name: null };
    }
    const left = departed.find(
      (m) => m.userId === creatorId && m.tenantId === tenantOf(row),
    );
    const name = names.get(creatorId);
    return {
      ...row,
      creator_name: left
        ? departedMemberName(left, { full_name: name })
        : name || null,
    };
  });
}

/** The task's tenant_id when the row carries one (task rows from `select("*")` do). */
function tenantOf(row: object): unknown {
  return "tenant_id" in row ? row.tenant_id : undefined;
}
