import { assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { readCallerTable, type LoadCallerTable } from "./caller-table.ts";

const row = {
  id: "t1",
  integration_type: "facebook_insights",
  integration_settings: { currency: "ILS" },
  category: null,
};

/** A caller's read that answers with `result`. */
const loader =
  (result: Awaited<ReturnType<LoadCallerTable>>): LoadCallerTable =>
  () =>
    Promise.resolve(result);

describe("readCallerTable", () => {
  it("a table RLS hides from the caller answers 404, like a missing one", async () => {
    assertEquals(
      await readCallerTable(loader({ data: null, error: null }), "t1"),
      { ok: false, status: 404, error: "Table not found" },
    );
  });

  it("a read error answers 500 with a generic message", async () => {
    assertEquals(
      await readCallerTable(
        loader({ data: null, error: { message: "boom" } }),
        "t1",
      ),
      { ok: false, status: 500, error: "Failed to fetch table" },
    );
  });

  it("a table the caller can open comes back with its settings", async () => {
    assertEquals(
      await readCallerTable(loader({ data: row, error: null }), "t1"),
      { ok: true, table: row },
    );
    assertEquals(
      await readCallerTable(
        loader({ data: { ...row, integration_settings: "x" }, error: null }),
        "t1",
      ),
      { ok: true, table: { ...row, integration_settings: null } },
    );
  });
});
