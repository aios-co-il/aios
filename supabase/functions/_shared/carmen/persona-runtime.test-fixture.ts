/** Fakes for the persona-runtime tests. */

interface Answer {
  data: unknown;
  error: { message: string } | null;
}

/** A client that answers each table's read with a fixed result, whatever the filters. */
export function db(tables: Record<string, Answer>) {
  return {
    from: (table: string) => {
      const answer = tables[table] ?? { data: [], error: null };
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: () => Promise.resolve(answer),
        then: (resolve: (value: Answer) => unknown) => resolve(answer),
      };
      return query;
    },
  };
}

/** A stored character row. */
export function row(fields: Record<string, unknown>) {
  return {
    id: "row-1",
    builtin_key: null,
    owner_user_id: null,
    display_name: "דמות",
    call_words: [],
    intro_line: null,
    look: "orbs",
    mood: null,
    personality: null,
    soul: null,
    writing_style: null,
    ...fields,
  };
}
