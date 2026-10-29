import { assertEquals, assertRejects } from "jsr:@std/assert@1";

import { fakeSupabaseHttp } from "./fake-supabase-http.ts";

const SUPABASE_URL = "https://this-project.supabase.co";

/** GET /rest/v1/tasks with this query string, over three task rows. */
async function tasks(query: string) {
  const http = fakeSupabaseHttp({
    supabaseUrl: SUPABASE_URL,
    tables: {
      tasks: [
        { id: "a", due: "2026-10-01", agent: null },
        { id: "b", due: "2026-10-20", agent: "carmen" },
        { id: "c", due: "2026-11-01", agent: "carmen" },
      ],
    },
  });
  const res = await http.fetch(`${SUPABASE_URL}/rest/v1/tasks?${query}`);
  const rows: { id: string }[] = await res.json();
  return rows.map((row) => row.id);
}

Deno.test("fakeSupabaseHttp", async (t) => {
  await t.step("applies range filters and not. negation", async () => {
    assertEquals(await tasks("due=lt.2026-10-28"), ["a", "b"]);
    assertEquals(await tasks("due=gte.2026-10-20&agent=not.is.null"), [
      "b",
      "c",
    ]);
  });

  await t.step("an operator it does not model throws", async () => {
    await assertRejects(
      () => tasks("title=ilike.*report*"),
      Error,
      'unsupported filter "ilike.*report*"',
    );
  });
});
