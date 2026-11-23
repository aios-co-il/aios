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

const ENTRY = "77777777-7777-4777-8777-777777777777";
const llm = { tenant_id: TENANT, integration_type: "llm", is_active: true };

/** A calendar entry of the client. */
function entry(extra: Record<string, unknown> = {}) {
  return {
    id: ENTRY,
    tenant_id: TENANT,
    client_id: CLIENT_ID,
    work_item_id: "wi-1",
    title: "איך בוחרים קבלן",
    primary_keyword: "קבלן שיפוצים",
    approval_status: "approved",
    generation_status: "planned",
    content_html: null,
    ...extra,
  };
}

/** Runs generate_seo_article_draft on one entry. */
async function draft(
  row: Record<string, unknown>,
  options: Parameters<typeof actionCtx>[0] = {},
  args: Record<string, unknown> = {},
  integrations = [llm],
) {
  const db = fakeActionDb({
    clients: [clientRow()],
    seo_geo_calendar_entries: [row],
    tenant_integrations: integrations,
  });
  const { ctx, invocations } = actionCtx(options);
  const result = await executeSeoActionTool(
    db,
    ctx,
    "generate_seo_article_draft",
    {
      client_id: CLIENT_ID,
      entry_id: ENTRY,
      ...args,
    },
  );
  return { db, result, invocations };
}

Deno.test("an entry of another client reads as not found", async () => {
  const { result } = await draft(entry({ client_id: "someone-else" }));
  assertEquals(at(result, "error"), "entry_not_found");
});

Deno.test(
  "an unapproved entry, a live draft or a published entry is not drafted",
  async () => {
    assertEquals(
      at((await draft(entry({ approval_status: "pending" }))).result, "error"),
      "entry_not_approved",
    );
    assertEquals(
      at(
        (
          await draft(
            entry({ generation_status: "draft", content_html: "<p>x</p>" }),
          )
        ).result,
        "error",
      ),
      "draft_exists",
    );
    assertEquals(
      at(
        (await draft(entry({ generation_status: "published" }))).result,
        "error",
      ),
      "already_published",
    );
  },
);

Deno.test(
  "without an AI connection in the client's tenant nothing is queued",
  async () => {
    const { result, db } = await draft(entry(), {}, {}, []);
    assertEquals(at(result, "error"), "not_connected");
    assertEquals(db.writes, []);
  },
);

Deno.test("regenerate=true queues a rewrite of an existing draft", async () => {
  const { result } = await draft(
    entry({ generation_status: "draft", content_html: "<p>x</p>" }),
    {},
    {
      regenerate: true,
    },
  );
  assertEquals(at(result, "pending_approval"), true);
  assertEquals(at(result, "cost", "calls"), 1);
});

Deno.test("the approved draft runs generate-entry for the entry", async () => {
  const { result, invocations } = await draft(entry(), { approved: true });
  assertEquals(invocations, [
    { fn: "marketing-seo-generate-entry", body: { entry_id: ENTRY } },
  ]);
  assertEquals(at(result, "success"), true);
});

Deno.test(
  "a failed generation puts the entry back so it can be retried",
  async () => {
    const row = entry();
    const { result } = await draft(row, {
      approved: true,
      // generate-entry marks the entry 'generating' before it calls OpenAI.
      onInvoke: () => {
        row.generation_status = "generating";
      },
      replies: {
        "marketing-seo-generate-entry": {
          ok: false,
          json: { error: "OpenAI 401" },
        },
      },
    });
    assertEquals(at(result, "error"), "generation_failed");
    assertEquals(row.generation_status, "planned");
  },
);
