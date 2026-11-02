/** The slice of the Supabase client the transfer uses, so tests can fake it. */
export type MergeDb = {
  from: (table: "lead_source_events") => {
    update: (row: { lead_id: string }) => {
      eq: (
        column: "tenant_id",
        value: string,
      ) => {
        in: (
          column: "lead_id",
          values: string[],
        ) => {
          select: (columns: "id") => PromiseLike<{
            data: unknown[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
};

/**
 * Move the duplicates' arrival-source history to the surviving lead, within
 * the tenant, and return how many rows moved. Throws when the move fails:
 * deleting the duplicates afterwards would cascade their history away.
 */
export async function transferLeadSourceEvents(
  db: MergeDb,
  merge: { tenantId: string; masterId: string; duplicateIds: string[] },
): Promise<number> {
  const { data, error } = await db
    .from("lead_source_events")
    .update({ lead_id: merge.masterId })
    .eq("tenant_id", merge.tenantId)
    .in("lead_id", merge.duplicateIds)
    .select("id");
  if (error) {
    throw new Error(
      `Source history not moved to lead ${merge.masterId}; duplicates kept: ${error.message}`,
    );
  }
  return data?.length ?? 0;
}
