import {
  assertEquals,
  assertStrictEquals,
  assertStringIncludes,
} from "jsr:@std/assert@1";

import { fakeDb } from "../_shared/carmen/pulse-targets/fake-db.ts";
import {
  NOW,
  RATIONALE,
  seed,
  settingsOf,
} from "../_shared/carmen/pulse-targets/test-fixtures.ts";
import { TABLE_NOT_WRITTEN } from "../_shared/carmen/pulse-targets/write-table-settings.ts";
import { at } from "../_shared/pulse/test-fixtures.ts";
import {
  applyApprovedPulseTarget,
  handlePulseTargetApproval,
} from "./pulse-target-approval.ts";

const HEADERS = { "Content-Type": "application/json" };

/** A queued set_pulse_target for campaign c1's CPL on the Meta table. */
function queuedRow(over: Record<string, unknown> = {}) {
  return {
    id: "approval-1",
    tenant_id: "tenant-1",
    status: "pending",
    tool_name: "set_pulse_target",
    requested_by: "user-1",
    approved_at: null,
    expires_at: "2026-10-27T08:00:00.000Z",
    tool_input: {
      client_id: "client-1",
      platform: "meta",
      goal: "leads",
      kind: "cpl",
      value: 45,
      campaign_id: "c1",
      campaign_name: "לידים שיפוץ",
      table_ids: ["t-meta", "t-other-client"],
    },
    ...over,
  };
}

/** The seeded client with Carmen's market CPL on campaign c1 and a queued row. */
function dbWithQueuedRow(failOn?: Parameters<typeof fakeDb>[1]) {
  const tables = seed({
    pulse_targets: {
      c1: { cpl: 60, source: "carmen_market", rationale: RATIONALE },
    },
  });
  tables.agent_approval_queue = [queuedRow()];
  return fakeDb(tables, failOn);
}

Deno.test(
  "an approved set_pulse_target replaces Carmen's market target",
  async () => {
    const db = dbWithQueuedRow();
    const outcome = await applyApprovedPulseTarget(
      db,
      queuedRow(),
      "owner-1",
      () => NOW,
    );
    assertStrictEquals(outcome.ok, true);
    assertEquals(at(settingsOf(db, "t-meta"), "pulse_targets", "c1"), {
      cpl: 45,
      source: "approved",
      set_at: NOW.toISOString(),
      set_by: "user-1",
      approved_by: "owner-1",
      goal: "leads",
    });
    const tableWrites = db.writes.filter((w) => w.table === "crm_tables");
    assertEquals(tableWrites[0].filters, ["id", "tenant_id"]);
  },
);

Deno.test("an expired request answers 410 and is marked expired", async () => {
  const db = dbWithQueuedRow();
  const expired = queuedRow({ expires_at: "2026-10-25T08:00:00.000Z" });
  const response = await handlePulseTargetApproval(
    db,
    expired,
    "approval-1",
    "owner-1",
    HEADERS,
    () => NOW,
  );
  assertStrictEquals(response.status, 410);
  assertEquals(await response.json(), {
    error: "expired",
    approval_id: "approval-1",
  });
  assertStrictEquals(db.tables.agent_approval_queue[0].status, "expired");
  assertStrictEquals(
    at(settingsOf(db, "t-meta"), "pulse_targets", "c1", "cpl"),
    60,
  );
});

Deno.test(
  "the request records executed, or failed when no table matches",
  async () => {
    const db = dbWithQueuedRow();
    const ok = await handlePulseTargetApproval(
      db,
      queuedRow(),
      "approval-1",
      "owner-1",
      HEADERS,
      () => NOW,
    );
    assertStrictEquals(ok.status, 200);
    const [row] = db.tables.agent_approval_queue;
    assertStrictEquals(row.status, "executed");
    assertStrictEquals(row.approved_by, "owner-1");
    assertStrictEquals(at(row, "execution_result", "target"), "CPL 45");

    const elsewhere = queuedRow({
      tool_input: { ...queuedRow().tool_input, table_ids: ["t-other-client"] },
    });
    const failed = await handlePulseTargetApproval(
      db,
      elsewhere,
      "approval-1",
      null,
      HEADERS,
      () => NOW,
    );
    assertStrictEquals(failed.status, 400);
    assertStrictEquals(db.tables.agent_approval_queue[0].status, "failed");
    assertStrictEquals(db.tables.agent_approval_queue[0].approved_by, "user-1");
  },
);

Deno.test(
  "a target write that matches no table records failed, never executed",
  async () => {
    // The table was deleted after it was read: the update returns no error and
    // no row.
    const db = dbWithQueuedRow({
      table: "crm_tables",
      op: "update",
      noMatch: true,
    });
    const response = await handlePulseTargetApproval(
      db,
      queuedRow(),
      "approval-1",
      "owner-1",
      HEADERS,
      () => NOW,
    );
    assertStrictEquals(response.status, 400);
    const body = await response.json();
    assertStrictEquals(body.success, false);
    assertStrictEquals(at(body, "result", "error"), TABLE_NOT_WRITTEN);
    assertEquals(at(body, "result", "still_written"), []);
    assertStrictEquals(db.tables.agent_approval_queue[0].status, "failed");
  },
);

Deno.test("a status write that fails answers 500", async () => {
  const db = dbWithQueuedRow({ table: "agent_approval_queue", op: "update" });
  const response = await handlePulseTargetApproval(
    db,
    queuedRow(),
    "approval-1",
    "owner-1",
    HEADERS,
    () => NOW,
  );
  assertStrictEquals(response.status, 500);
  assertEquals(await response.json(), {
    error: "status_not_saved",
    approval_id: "approval-1",
  });
  assertStrictEquals(db.tables.agent_approval_queue[0].status, "pending");
});

Deno.test(
  "a table that fails after another took the target restores it and records failed",
  async () => {
    const db = dbWithQueuedRow({
      table: "crm_tables",
      op: "update",
      id: "t-meta-2",
    });
    db.tables.crm_tables.push({
      ...db.tables.crm_tables[0],
      id: "t-meta-2",
      integration_settings: {},
    });
    const twoTables = queuedRow({
      tool_input: {
        ...queuedRow().tool_input,
        table_ids: ["t-meta", "t-meta-2"],
      },
    });
    const response = await handlePulseTargetApproval(
      db,
      twoTables,
      "approval-1",
      "owner-1",
      HEADERS,
      () => NOW,
    );
    assertStrictEquals(response.status, 400);
    assertEquals(at(await response.json(), "result"), {
      error: "crm_tables update failed",
      still_written: [],
    });
    assertEquals(at(settingsOf(db, "t-meta"), "pulse_targets", "c1"), {
      cpl: 60,
      source: "carmen_market",
      rationale: RATIONALE,
    });
    assertStrictEquals(db.tables.agent_approval_queue[0].status, "failed");
  },
);

/**
 * AIO-230 adds CARMEN_EXECUTOR_TOOLS, the tools the approvals page and Carmen's
 * "כן" may run, and refuses any other row. Its source, or null before it lands.
 */
const EXECUTOR_TOOLS_SOURCE = await Deno.readTextFile(
  new URL("../_shared/carmen/approvals/executor-tools.ts", import.meta.url),
).catch((error) => {
  if (error instanceof Deno.errors.NotFound) {
    return null;
  }
  throw error;
});

Deno.test({
  name: "set_pulse_target is listed in CARMEN_EXECUTOR_TOOLS once AIO-230 adds it",
  ignore: EXECUTOR_TOOLS_SOURCE === null,
  fn: () => {
    assertStringIncludes(EXECUTOR_TOOLS_SOURCE ?? "", '"set_pulse_target"');
  },
});
