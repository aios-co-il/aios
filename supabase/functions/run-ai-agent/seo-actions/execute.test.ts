import { assertEquals } from "jsr:@std/assert@1";
import { at } from "../../_shared/pulse/test-fixtures.ts";
import { executeSeoActionTool } from "./execute.ts";
import {
  AGENCY_A,
  AGENCY_B,
  CLIENT_ID,
  OTHER_TENANT,
  REQUESTER,
  TENANT,
  actionCtx,
  clientRow,
  fakeActionDb,
  seoCtx,
} from "./fake-db.test-fixture.ts";

const own = { tenant_id: TENANT, client_id: CLIENT_ID };

/** A client with a program and one phrase in it. */
function seed() {
  return {
    clients: [clientRow()],
    seo_geo_programs: [
      { ...own, work_item_id: "wi-1", updated_at: "2026-11-01" },
    ],
    seo_geo_keywords: [
      {
        ...own,
        id: "kw-1",
        work_item_id: "wi-1",
        keyword: "שיפוץ דירה",
        priority: "low",
      },
    ],
  };
}
const ARGS = {
  client_id: CLIENT_ID,
  keywords: [
    { keyword: "שיפוץ מטבח" },
    { keyword: "שיפוץ דירה", priority: "high" },
  ],
};

Deno.test("an action is queued for approval and nothing runs", async () => {
  const db = fakeActionDb(seed());
  const { ctx, invocations } = actionCtx();
  const result = await executeSeoActionTool(
    db,
    ctx,
    "upsert_seo_keywords",
    ARGS,
  );
  assertEquals(at(result, "pending_approval"), true);
  const [row] = db.writes;
  assertEquals([row.table, row.op], ["agent_approval_queue", "insert"]);
  assertEquals(at(row.rows[0], "action_type"), "agent_direct_tool");
  assertEquals(at(row.rows[0], "tool_name"), "upsert_seo_keywords");
  assertEquals(at(row.rows[0], "requested_by"), REQUESTER);
  assertEquals(at(row.rows[0], "tenant_id"), TENANT);
  assertEquals(at(row.rows[0], "tool_input", "client_id"), CLIENT_ID);
  assertEquals(db.writes.length, 1);
  assertEquals(invocations, []);
});

Deno.test("asking again reuses the open request", async () => {
  const db = fakeActionDb(seed());
  const first = await executeSeoActionTool(
    db,
    actionCtx().ctx,
    "upsert_seo_keywords",
    ARGS,
  );
  const again = await executeSeoActionTool(
    db,
    actionCtx().ctx,
    "upsert_seo_keywords",
    ARGS,
  );
  assertEquals(at(again, "approval_id"), at(first, "approval_id"));
  assertEquals(at(again, "reused_open_request"), true);
  assertEquals(db.writes.length, 1);
});

Deno.test("the approved row runs the action and queues nothing", async () => {
  const db = fakeActionDb(seed());
  const result = await executeSeoActionTool(
    db,
    actionCtx({ approved: true }).ctx,
    "upsert_seo_keywords",
    ARGS,
  );
  assertEquals(at(result, "added"), ["שיפוץ מטבח"]);
  assertEquals(at(result, "updated"), 1);
  assertEquals(
    db.writes.some((w) => w.table === "agent_approval_queue"),
    false,
  );
});

Deno.test("without a person asking, nothing is queued", async () => {
  const db = fakeActionDb(seed());
  const result = await executeSeoActionTool(
    db,
    actionCtx({ actorUserId: null }).ctx,
    "upsert_seo_keywords",
    ARGS,
  );
  assertEquals(at(result, "error"), "human_requester_required");
  assertEquals(db.writes, []);
});

Deno.test(
  "a client in an agency the caller's tenant does not hold is refused",
  async () => {
    const db = fakeActionDb({
      ...seed(),
      clients: [clientRow({ tenant_id: OTHER_TENANT, agency_id: AGENCY_B })],
      agency_tenant_access: [
        {
          source_tenant_id: OTHER_TENANT,
          accessing_tenant_id: TENANT,
          agency_id: AGENCY_A,
        },
      ],
    });
    const base = { ...seoCtx(), accessibleTenantIds: [TENANT, OTHER_TENANT] };
    const result = await executeSeoActionTool(
      db,
      actionCtx({ base }).ctx,
      "upsert_seo_keywords",
      ARGS,
    );
    assertEquals(at(result, "error"), "client_not_found");
    assertEquals(db.writes, []);
  },
);
