import { assertEquals } from "jsr:@std/assert@1";
import { at } from "../../_shared/pulse/test-fixtures.ts";
import { executeSeoActionTool } from "./execute.ts";
import {
  CLIENT_ID,
  TENANT,
  actionCtx,
  clientRow,
  fakeActionDb,
} from "./fake-db.test-fixture.ts";

const own = { tenant_id: TENANT, client_id: CLIENT_ID };

/** Runs upsert_seo_keywords as an approved row on a seed. */
async function run(
  seed: Record<string, Array<Record<string, unknown>>>,
  keywords: unknown,
) {
  const db = fakeActionDb({ clients: [clientRow()], ...seed });
  const result = await executeSeoActionTool(
    db,
    actionCtx({ approved: true }).ctx,
    "upsert_seo_keywords",
    { client_id: CLIENT_ID, keywords },
  );
  return { db, result };
}

Deno.test("a client without an SEO program gets no_program", async () => {
  const { result, db } = await run({}, ["שיפוץ"]);
  assertEquals(at(result, "error"), "no_program");
  assertEquals(db.writes, []);
});

Deno.test("bad phrases are refused before any write", async () => {
  for (const keywords of [
    [],
    ["a", "A"],
    [{ keyword: "x", priority: "urgent" }],
    "x",
  ]) {
    const { result, db } = await run({}, keywords);
    assertEquals(at(result, "error"), "invalid_args");
    assertEquals(db.writes, []);
  }
});

Deno.test(
  "new phrases are added after the old ones and old ones keep their fields",
  async () => {
    const { result, db } = await run(
      {
        seo_geo_programs: [
          { ...own, work_item_id: "wi-1", updated_at: "2026-11-01" },
        ],
        seo_geo_keywords: [
          {
            ...own,
            id: "kw-1",
            work_item_id: "wi-1",
            keyword: "Renovation",
            intent: "info",
            priority: "low",
          },
        ],
      },
      [{ keyword: "שיפוץ מטבח", priority: "high" }, { keyword: "renovation" }],
    );
    assertEquals(at(result, "added"), ["שיפוץ מטבח"]);
    assertEquals(at(result, "updated"), 0);
    const added = db.writes.find((w) => w.op === "upsert")?.rows[0];
    assertEquals(at(added, "source"), "carmen");
    assertEquals(at(added, "sort_order"), 1);
    assertEquals(at(added, "work_item_id"), "wi-1");
    assertEquals(
      db.writes.some((w) => w.op === "update"),
      false,
    );
  },
);
