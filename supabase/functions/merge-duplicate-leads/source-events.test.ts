import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { type MergeDb, transferLeadSourceEvents } from "./source-events.ts";

type QueryResult = {
  data: unknown[] | null;
  error: { message: string } | null;
};

/** Fake client: records each call; the query resolves to `result`. */
function fakeDb(result: QueryResult) {
  const calls: unknown[][] = [];
  const db: MergeDb = {
    from: (table) => {
      calls.push(["from", table]);
      return {
        update: (row) => {
          calls.push(["update", row]);
          return {
            eq: (column, value) => {
              calls.push(["eq", column, value]);
              return {
                in: (inColumn, values) => {
                  calls.push(["in", inColumn, values]);
                  return {
                    select: (columns) => {
                      calls.push(["select", columns]);
                      return Promise.resolve(result);
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  return { db, calls };
}

const merge = {
  tenantId: "t1",
  masterId: "master",
  duplicateIds: ["d1", "d2"],
};

Deno.test(
  "moves the duplicates' source history to the surviving lead in the tenant",
  async () => {
    const { db, calls } = fakeDb({
      data: [{ id: "e1" }, { id: "e2" }],
      error: null,
    });
    assertEquals(await transferLeadSourceEvents(db, merge), 2);
    assertEquals(calls, [
      ["from", "lead_source_events"],
      ["update", { lead_id: "master" }],
      ["eq", "tenant_id", "t1"],
      ["in", "lead_id", ["d1", "d2"]],
      ["select", "id"],
    ]);
  },
);

Deno.test(
  "a failed move throws, so the duplicates are not deleted with their history",
  async () => {
    const { db } = fakeDb({ data: null, error: { message: "timeout" } });
    await assertRejects(
      () => transferLeadSourceEvents(db, merge),
      Error,
      "timeout",
    );
  },
);
