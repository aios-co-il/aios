import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { type MergeDb, moveDuplicateRows } from "./lead-moves.ts";

type Failure = { table: string; op: "select" | "update" | "upsert" };

// tag-2 was added from another tenant; it stays that tenant's row.
const TAGS = [
  { tag_id: "tag-1", user_id: "u1", tenant_id: "t1" },
  { tag_id: "tag-1", user_id: "u2", tenant_id: "t1" },
  { tag_id: "tag-2", user_id: "u1", tenant_id: "t2" },
];

/**
 * Fake client: records each finished query as [table, op, ...args]; the query
 * named in `fail` resolves to an error, every other one succeeds.
 */
function fakeDb(fail?: Failure) {
  const calls: unknown[][] = [];
  const answer = <T>(table: string, op: Failure["op"], data: T[]) =>
    Promise.resolve(
      fail?.table === table && fail.op === op
        ? { data: null, error: { message: `${table} ${op} failed` } }
        : { data, error: null },
    );
  const db: MergeDb = {
    from: (table) => ({
      select: (columns) => ({
        in: (_leadColumn, ids) => {
          calls.push([table, "select", columns, ids]);
          return answer(table, "select", TAGS);
        },
      }),
      update: (row) => ({
        in: (_leadColumn, ids) => ({
          select: (_columns) => {
            calls.push([table, "update", row, ids]);
            return answer(table, "update", [{ id: "row-1" }]);
          },
        }),
      }),
      upsert: (rows, options) => ({
        select: (_columns) => {
          calls.push([table, "upsert", rows, options]);
          return answer(table, "upsert", rows.slice(1));
        },
      }),
    }),
  };
  return { db, calls };
}

const merge = {
  tenantId: "t1",
  masterId: "master",
  duplicateIds: ["d1", "d2"],
};

Deno.test(
  "moves everything on the duplicates to the surviving lead, whatever each row's tenant",
  async () => {
    const { db, calls } = fakeDb();
    assertEquals(await moveDuplicateRows(db, merge), {
      tags: 1,
      updates: 1,
      tasks: 1,
      messages: 1,
      sourceEvents: 1,
    });
    const toMaster = { lead_id: "master" };
    const tagOf = (tagId: string, tenantId: string) => ({
      tag_id: tagId,
      lead_id: "master",
      tenant_id: tenantId,
      user_id: "u1",
    });
    assertEquals(calls, [
      // The duplicate ids come from the tenant's leads and scope every move.
      [
        "chat_contact_tags",
        "select",
        "tag_id, user_id, tenant_id",
        ["d1", "d2"],
      ],
      [
        "chat_contact_tags",
        "upsert",
        [tagOf("tag-1", "t1"), tagOf("tag-2", "t2")],
        { onConflict: "tag_id,lead_id", ignoreDuplicates: true },
      ],
      ["lead_updates", "update", toMaster, ["d1", "d2"]],
      ["tasks", "update", toMaster, ["d1", "d2"]],
      ["chat_messages", "update", toMaster, ["d1", "d2"]],
      ["lead_source_events", "update", toMaster, ["d1", "d2"]],
    ]);
  },
);

const failures: Failure[] = [
  { table: "chat_contact_tags", op: "select" },
  { table: "chat_contact_tags", op: "upsert" },
  { table: "lead_updates", op: "update" },
  { table: "tasks", op: "update" },
  { table: "chat_messages", op: "update" },
  { table: "lead_source_events", op: "update" },
];

for (const failure of failures) {
  Deno.test(
    `a failed ${failure.table} ${failure.op} throws and moves nothing after it`,
    async () => {
      const { db, calls } = fakeDb(failure);
      await assertRejects(
        () => moveDuplicateRows(db, merge),
        Error,
        `${failure.table} ${failure.op} failed`,
      );
      const last = calls[calls.length - 1];
      assertEquals([last[0], last[1]], [failure.table, failure.op]);
    },
  );
}
