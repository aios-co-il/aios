/**
 * Tables whose rows hang off a lead by lead_id. Tags, updates, chat messages
 * and source history are deleted with the lead (ON DELETE CASCADE); tasks
 * would lose their lead (SET NULL).
 */
type MovedTable =
  | "chat_contact_tags"
  | "lead_updates"
  | "tasks"
  | "chat_messages"
  | "lead_source_events";

type QueryError = { message: string } | null;
type Rows<T> = PromiseLike<{ data: T[] | null; error: QueryError }>;
type ByLeads<T> = { in: (column: "lead_id", ids: string[]) => T };
type ByTenant<T> = { eq: (column: "tenant_id", value: string) => ByLeads<T> };
type Returning = { select: (columns: "id") => Rows<unknown> };

/** A tag row as the surviving lead gets it. */
export type TagRow = {
  tag_id: string;
  lead_id: string;
  tenant_id: string;
  user_id: string;
};

/** The slice of the Supabase client the moves use, so tests can fake it. */
export type MergeDb = {
  from: (table: MovedTable) => {
    select: (
      columns: "tag_id, user_id",
    ) => ByTenant<Rows<{ tag_id: string; user_id: string }>>;
    update: (row: {
      lead_id: string;
    }) => ByTenant<Returning> & ByLeads<Returning>;
    upsert: (
      rows: TagRow[],
      options: { onConflict: "tag_id,lead_id"; ignoreDuplicates: true },
    ) => Returning;
  };
};

/** One duplicate group: the tenant, the lead that stays and the ones that go. */
export type LeadMerge = {
  tenantId: string;
  masterId: string;
  duplicateIds: string[];
};

/** How many rows each move gave the surviving lead. */
export type MovedCounts = {
  tags: number;
  updates: number;
  tasks: number;
  messages: number;
  sourceEvents: number;
};

/**
 * Give the surviving lead everything on the duplicates, within the tenant.
 * Throws on the first failure, so the caller deletes nothing: the duplicate
 * delete would cascade whatever was not moved.
 */
export async function moveDuplicateRows(
  db: MergeDb,
  merge: LeadMerge,
): Promise<MovedCounts> {
  const tags = await copyTags(db, merge);
  const updates = await moveRows(db, "lead_updates", merge);
  const tasks = await moveRows(db, "tasks", merge);
  const messages = await moveRows(db, "chat_messages", merge);
  const sourceEvents = await moveRows(db, "lead_source_events", merge);
  return { tags, updates, tasks, messages, sourceEvents };
}

/**
 * Copy the duplicates' tags to the surviving lead, skipping ones it already
 * has; the duplicates' own tag rows go with their delete.
 */
async function copyTags(db: MergeDb, merge: LeadMerge): Promise<number> {
  const { data: tags, error } = await db
    .from("chat_contact_tags")
    .select("tag_id, user_id")
    .eq("tenant_id", merge.tenantId)
    .in("lead_id", merge.duplicateIds);
  if (error) {
    throw stopped("chat_contact_tags read", merge, error);
  }
  const rows = new Map<string, TagRow>();
  for (const tag of tags ?? []) {
    if (!rows.has(tag.tag_id)) {
      rows.set(tag.tag_id, {
        tag_id: tag.tag_id,
        lead_id: merge.masterId,
        tenant_id: merge.tenantId,
        user_id: tag.user_id,
      });
    }
  }
  if (rows.size === 0) {
    return 0;
  }
  const { data: copied, error: copyError } = await db
    .from("chat_contact_tags")
    .upsert([...rows.values()], {
      onConflict: "tag_id,lead_id",
      ignoreDuplicates: true,
    })
    .select("id");
  if (copyError) {
    throw stopped("chat_contact_tags copy", merge, copyError);
  }
  return copied?.length ?? 0;
}

/**
 * Point the duplicates' rows at the surviving lead. lead_updates has no
 * tenant_id; the duplicates themselves were read from the tenant's leads.
 */
async function moveRows(
  db: MergeDb,
  table: Exclude<MovedTable, "chat_contact_tags">,
  merge: LeadMerge,
): Promise<number> {
  const update = db.from(table).update({ lead_id: merge.masterId });
  const scoped =
    table === "lead_updates" ? update : update.eq("tenant_id", merge.tenantId);
  const { data, error } = await scoped
    .in("lead_id", merge.duplicateIds)
    .select("id");
  if (error) {
    throw stopped(`${table} move`, merge, error);
  }
  return data?.length ?? 0;
}

function stopped(
  step: string,
  merge: LeadMerge,
  error: { message: string },
): Error {
  return new Error(
    `${step} failed for lead ${merge.masterId}; duplicates kept: ${error.message}`,
  );
}
