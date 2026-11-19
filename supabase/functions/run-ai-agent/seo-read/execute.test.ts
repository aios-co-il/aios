import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { AccessDeniedError } from "../../_shared/auth-helpers.ts";
import { executeSeoReadTool } from "./execute.ts";
import {
  CLIENT_ID,
  OTHER_TENANT,
  clientRow,
  fakeSeoDb,
  seoCtx,
} from "./fake-db.test-fixture.ts";

Deno.test(
  "SEO tools refuse a missing or malformed client_id before reading",
  async () => {
    for (const args of [{}, { client_id: "אבי" }, { client_id: 42 }]) {
      const db = fakeSeoDb({ clients: [clientRow()] });
      const result = await executeSeoReadTool(
        db,
        seoCtx(),
        "get_seo_overview",
        args,
      );
      assertEquals((result as { error: string }).error, "invalid_args");
      assertEquals(db.reads.length, 0);
    }
  },
);

Deno.test(
  "SEO tools refuse top_n outside 1–50 instead of clamping it",
  async () => {
    for (const top_n of [0, 51, 2.5, "many"]) {
      const db = fakeSeoDb({ clients: [clientRow()] });
      const result = await executeSeoReadTool(db, seoCtx(), "get_seo_program", {
        client_id: CLIENT_ID,
        top_n,
      });
      assertEquals((result as { error: string }).error, "invalid_args");
    }
  },
);

Deno.test("a client of another tenant reads as not found", async () => {
  const db = fakeSeoDb({ clients: [clientRow({ tenant_id: OTHER_TENANT })] });
  const result = await executeSeoReadTool(db, seoCtx(), "get_ahrefs_snapshot", {
    client_id: CLIENT_ID,
  });
  assertEquals((result as { error: string }).error, "client_not_found");
  assertEquals(db.reads[0].filters, ["id", "tenant_id"]);
});

Deno.test(
  "a campaigner outside the client's team is refused with the guard's reason",
  async () => {
    const db = fakeSeoDb({ clients: [clientRow()] });
    const result = await executeSeoReadTool(
      db,
      seoCtx(new AccessDeniedError("הלקוח לא משויך אליך")),
      "get_ai_visibility",
      { client_id: CLIENT_ID },
    );
    assertEquals(result, {
      error: "access_denied",
      message: "הלקוח לא משויך אליך",
    });
    assertEquals(db.reads.length, 1);
  },
);

Deno.test(
  "an unexpected access-check failure and a failed client read throw",
  async () => {
    await assertRejects(() =>
      executeSeoReadTool(
        fakeSeoDb({ clients: [clientRow()] }),
        seoCtx(new Error("network")),
        "get_seo_program",
        { client_id: CLIENT_ID },
      ),
    );
    await assertRejects(() =>
      executeSeoReadTool(
        fakeSeoDb({}, ["clients"]),
        seoCtx(),
        "get_seo_program",
        {
          client_id: CLIENT_ID,
        },
      ),
    );
  },
);
