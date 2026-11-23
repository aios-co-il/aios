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
const program = {
  tenant_id: TENANT,
  client_id: CLIENT_ID,
  work_item_id: "wi-1",
  wordpress_site_id: "wp-1",
};

/** A drafted, approved calendar entry of the client. */
function entry(extra: Record<string, unknown> = {}) {
  return {
    id: ENTRY,
    tenant_id: TENANT,
    client_id: CLIENT_ID,
    work_item_id: "wi-1",
    title: "איך בוחרים קבלן",
    approval_status: "approved",
    generation_status: "draft",
    content_html: "<p>מאמר</p>",
    ...extra,
  };
}

/** Runs publish_seo_article on one entry. */
async function publish(
  row: Record<string, unknown>,
  options: Parameters<typeof actionCtx>[0] = {},
  programs = [program],
) {
  const db = fakeActionDb({
    clients: [clientRow()],
    seo_geo_calendar_entries: [row],
    seo_geo_programs: programs,
  });
  const { ctx, invocations } = actionCtx(options);
  const result = await executeSeoActionTool(db, ctx, "publish_seo_article", {
    client_id: CLIENT_ID,
    entry_id: ENTRY,
  });
  return { db, result, invocations };
}

Deno.test("a program without a WordPress site cannot publish", async () => {
  const { result, db } = await publish(entry(), {}, [
    { ...program, wordpress_site_id: null },
  ]);
  assertEquals(at(result, "error"), "not_connected");
  assertEquals(db.writes, []);
});

Deno.test("only an approved draft with content is published", async () => {
  assertEquals(
    at((await publish(entry({ content_html: "" }))).result, "error"),
    "no_draft",
  );
  assertEquals(
    at((await publish(entry({ approval_status: "pending" }))).result, "error"),
    "entry_not_approved",
  );
});

Deno.test(
  "a published entry is never published again, even when its row was approved",
  async () => {
    const { result, invocations } = await publish(
      entry({
        generation_status: "published",
        live_url: "https://example.co.il/a",
      }),
      { approved: true },
    );
    assertEquals(at(result, "error"), "already_published");
    assertEquals(invocations, []);
  },
);

Deno.test("the queued publish names the public post", async () => {
  const { result, invocations } = await publish(entry());
  assertEquals(at(result, "pending_approval"), true);
  assertEquals(invocations, []);
});

Deno.test("the approved publish returns the live link", async () => {
  const { result, invocations } = await publish(entry(), {
    approved: true,
    replies: {
      "marketing-seo-publish-due": {
        ok: true,
        json: {
          published: 1,
          results: [{ id: ENTRY, ok: true, link: "https://example.co.il/a" }],
        },
      },
    },
  });
  assertEquals(invocations[0], {
    fn: "marketing-seo-publish-due",
    body: { entry_id: ENTRY },
  });
  assertEquals(at(result, "live_url"), "https://example.co.il/a");
});

Deno.test("a WordPress failure is reported", async () => {
  const { result } = await publish(entry(), {
    approved: true,
    replies: {
      "marketing-seo-publish-due": {
        ok: true,
        json: { results: [{ id: ENTRY, ok: false, error: "401" }] },
      },
    },
  });
  assertEquals(at(result, "error"), "publish_failed");
});
