import {
  assert,
  assertEquals,
  assertMatch,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";

import { at } from "../../pulse/test-fixtures.ts";
import { fakeDb } from "./fake-db.ts";
import { requestApprovedTarget } from "./request-approved-target.ts";
import { ctx, seed } from "./test-fixtures.ts";

const CAMPAIGN_CPL = {
  client_id: "client-1",
  platform: "meta",
  goal: "leads",
  value: 45,
  campaign_id: "c1",
};

Deno.test(
  "set_pulse_target queues an approval for a human and writes nothing",
  async () => {
    const db = fakeDb(seed());
    const noHuman = await requestApprovedTarget(
      db,
      ctx({ actorUserId: null }),
      {
        client_id: "client-1",
        platform: "meta",
        goal: "leads",
        value: 45,
      },
    );
    assertStrictEquals(at(noHuman, "error"), "human_requester_required");

    const queued = await requestApprovedTarget(db, ctx(), CAMPAIGN_CPL);
    assertStrictEquals(at(queued, "pending_approval"), true);
    const [row] = db.tables.agent_approval_queue;
    assertStrictEquals(row.status, "pending");
    assertStrictEquals(row.tool_name, "set_pulse_target");
    assertStrictEquals(row.requested_by, "user-1");
    assertEquals(at(row, "tool_input", "table_ids"), ["t-meta"]);
    assertStrictEquals(at(row, "tool_input", "campaign_name"), "לידים שיפוץ");
    assertMatch(String(row.title), /CPL 45/);
    assert(!db.writes.some((w) => w.table === "crm_tables"));

    const again = await requestApprovedTarget(db, ctx(), CAMPAIGN_CPL);
    assertStrictEquals(at(again, "reused_existing"), true);
    assertStrictEquals(db.tables.agent_approval_queue.length, 1);
  },
);

Deno.test(
  "set_pulse_target refuses a goal the campaign is not measured on",
  async () => {
    const db = fakeDb(seed());
    const result = await requestApprovedTarget(db, ctx(), {
      ...CAMPAIGN_CPL,
      goal: "ecommerce",
      kind: "roas",
      value: 3,
    });
    assertStrictEquals(at(result, "error"), "goal_mismatch");
    assertStrictEquals(db.tables.agent_approval_queue.length, 0);
  },
);

Deno.test(
  "a failed lookup of open requests throws instead of queueing a duplicate",
  async () => {
    const db = fakeDb(seed(), { table: "agent_approval_queue", op: "select" });
    await assertRejects(
      () => requestApprovedTarget(db, ctx(), CAMPAIGN_CPL),
      Error,
      "agent_approval_queue select failed",
    );
    assertStrictEquals(db.tables.agent_approval_queue.length, 0);
  },
);
