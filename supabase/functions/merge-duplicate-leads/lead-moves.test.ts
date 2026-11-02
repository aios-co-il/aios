import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { type MergeDb, moveDuplicateRows } from "./lead-moves.ts";

type Failure = { table: string; op: "select" | "update" | "upsert" };

const TAGS = [
  { tag_id: "tag-1", user_id: "u1" },
  { tag_id: "tag-1", user_id: "u2" },
  { tag_id: "tag-2", user_id: "u1" },
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
        eq: (_column, tenantId) => ({
          in: (_leadColumn, ids) => {
            calls.push([table, "select", columns, tenantId, ids]);
            return answer(table, "select", TAGS);
          },
        }),
      }),
      update: (row) => {
        const moved = (tenantId: string | null) => ({
          in: (_leadColumn: "lead_id", ids: string[]) => ({
            select: (_columns: "id") => {
              calls.push([table, "update", row, tenantId, ids]);
              return answer(table, "update", [{ id: "row-1" }]);
            },
          }),
        });
        return { ...moved(null), eq: (_column, tenantId) => moved(tenantId) };
      },
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
  "moves everything on the duplicates to the surviving lead, in the tenant",
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
    const tagOf = (tagId: string) => ({
      tag_id: tagId,
      lead_id: "master",
      tenant_id: "t1",
      user_id: "u1",
    });
    assertEquals(calls, [
      ["chat_contact_tags", "select", "tag_id, user_id", "t1", ["d1", "d2"]],
      [
        "chat_contact_tags",
        "upsert",
        [tagOf("tag-1"), tagOf("tag-2")],
        { onConflict: "tag_id,lead_id", ignoreDuplicates: true },
      ],
      // lead_updates has no tenant_id; the duplicates are the tenant's leads.
      ["lead_updates", "update", toMaster, null, ["d1", "d2"]],
      ["tasks", "update", toMaster, "t1", ["d1", "d2"]],
      ["chat_messages", "update", toMaster, "t1", ["d1", "d2"]],
      ["lead_source_events", "update", toMaster, "t1", ["d1", "d2"]],
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
