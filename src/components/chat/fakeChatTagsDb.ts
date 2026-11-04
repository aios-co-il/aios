// The Supabase stand-in for chat tag tests: in-memory `chat_tags` and
// `chat_contact_tags` tables filtered by `eq`. A delete removes the matching
// rows except those RLS keeps (`keptIds`) and answers only the rows it
// removed, as PostgREST does when RLS refuses a delete without an error.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Row = { id: string } & Record<string, unknown>;

export type FakeChatTagsTables = {
  chat_tags?: Array<Row>;
  chat_contact_tags?: Array<Row>;
  /** `chat_contact_tags` ids RLS refuses to delete for the current user. */
  keptIds?: Array<string>;
};

/** A database over `tables`, read on each query and mutated by deletes. */
export function fakeChatTagsDb(tables: FakeChatTagsTables) {
  const fake = {
    from: (table: "chat_tags" | "chat_contact_tags") =>
      tableQuery(tables[table] ?? [], new Set(tables.keptIds ?? [])),
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: "user-1" } } }),
    },
  };
  // One cast for the whole fake: it implements only the calls the chat tag code makes.
  return fake as unknown as Pick<SupabaseClient<Database>, "from" | "auth">;
}

/** A chainable query over `rows` that runs when awaited. */
function tableQuery(rows: Array<Row>, kept: Set<string>) {
  const filters: Array<[string, unknown]> = [];
  let isDelete = false;

  /** Applies the query: a delete splices out the rows RLS allows. */
  function run() {
    const matching = rows.filter((row) =>
      filters.every(([column, value]) => row[column] === value),
    );
    if (!isDelete) {
      return { data: matching, error: null };
    }
    const removed = matching.filter((row) => !kept.has(row.id));
    for (const row of removed) {
      rows.splice(rows.indexOf(row), 1);
    }
    return { data: removed.map(({ id }) => ({ id })), error: null };
  }

  const query = {
    delete: () => {
      isDelete = true;
      return query;
    },
    select: () => query,
    order: () => query,
    limit: () => query,
    eq: (column: string, value: unknown) => {
      filters.push([column, value]);
      return query;
    },
    then: <T>(resolve: (result: ReturnType<typeof run>) => T) =>
      Promise.resolve(run()).then(resolve),
  };
  return query;
}
