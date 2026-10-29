import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  ensureSeoProgram,
  findSeoProgram,
  type ProgramDb,
  type SeoProgram,
} from "./program.ts";

const ITEM = { id: "item-1", tenant_id: "tenant-1", client_id: "client-a" };

type DbError = { code?: string; message: string };

/**
 * seo_geo_programs as PostgREST shows it: one program per work item. `insertError` is what the
 * insert answers (a concurrent intake that made the program first answers 23505), and
 * `onInsert` lets that other intake's row appear.
 */
function fakeDb({
  program = null as SeoProgram | null,
  lookupError = null as DbError | null,
  insertError = null as DbError | null,
  onInsert = undefined as SeoProgram | undefined,
} = {}) {
  const writes: Array<{ method: string; row: unknown }> = [];
  let row = program;
  const db: ProgramDb = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: lookupError ? null : row,
            error: lookupError,
          }),
        }),
      }),
      insert: async (value: unknown) => {
        writes.push({ method: "insert", row: value });
        if (onInsert) row = onInsert;
        return { data: null, error: insertError };
      },
      update: (value: unknown) => {
        writes.push({ method: "update", row: value });
        return { eq: async () => ({ data: null, error: null }) };
      },
    }),
  };
  return { db, writes };
}

Deno.test("an existing program keeps the site the user picked", async () => {
  const program = { client_id: "client-a", wordpress_site_id: "site-b" };
  const { db, writes } = fakeDb({ program });
  const saved = await ensureSeoProgram(db, ITEM, program, "site-a");
  assertEquals(saved, program);
  assertEquals(writes, []);
});

Deno.test(
  "a project without a program gets one on its client and the client's site",
  async () => {
    const { db, writes } = fakeDb();
    const saved = await ensureSeoProgram(db, ITEM, null, "site-a");
    assertEquals(saved, { client_id: "client-a", wordpress_site_id: "site-a" });
    assertEquals(writes, [
      {
        method: "insert",
        row: {
          tenant_id: "tenant-1",
          client_id: "client-a",
          work_item_id: "item-1",
          wordpress_site_id: "site-a",
        },
      },
    ]);
  },
);

Deno.test(
  "a program another intake made first is kept when it is on the project's client",
  async () => {
    const theirs = { client_id: "client-a", wordpress_site_id: "site-b" };
    const { db, writes } = fakeDb({
      insertError: { code: "23505", message: "duplicate key" },
      onInsert: theirs,
    });
    assertEquals(await ensureSeoProgram(db, ITEM, null, "site-a"), theirs);
    assertEquals(
      writes.map((w) => w.method),
      ["insert"],
    );
  },
);

Deno.test(
  "a program another intake made first on another client is refused",
  async () => {
    const { db } = fakeDb({
      insertError: { code: "23505", message: "duplicate key" },
      onInsert: { client_id: "client-b", wordpress_site_id: null },
    });
    assertEquals(await ensureSeoProgram(db, ITEM, null, "site-a"), null);
  },
);

Deno.test("any other failed insert throws", async () => {
  const { db } = fakeDb({ insertError: { message: "permission denied" } });
  await assertRejects(
    () => ensureSeoProgram(db, ITEM, null, "site-a"),
    Error,
    "permission denied",
  );
});

Deno.test(
  "a failed program lookup throws rather than reading as no program",
  async () => {
    const { db } = fakeDb({ lookupError: { message: "timeout" } });
    await assertRejects(() => findSeoProgram(db, "item-1"), Error, "timeout");
  },
);
