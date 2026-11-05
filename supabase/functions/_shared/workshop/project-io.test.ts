import { assert, assertStrictEquals } from "jsr:@std/assert@1";
import { savePayload } from "./project-io.ts";
import { fakeDb } from "./tools/test-fakes.ts";

type Db = ReturnType<typeof fakeDb>;

/** The payload savePayload wrote to the project. */
const written = (db: Db) =>
  db.calls.find((c) => c.table === "marketing_work_items" && c.op === "update")
    ?.value as { payload: Record<string, unknown> };

Deno.test(
  "savePayload keeps the mode the user switched to while the tool ran",
  async () => {
    // The tool loaded the project in automatic mode; the user switched to semi-automatic since.
    const db = fakeDb({
      "marketing_work_items:select": {
        payload: { workshop_mode: "semi", title: "old" },
      },
    });
    await savePayload(db, "tenant-1", "item-1", {
      workshop_mode: "auto",
      title: "new",
    });
    const { payload } = written(db);
    assertStrictEquals(payload.workshop_mode, "semi");
    assertStrictEquals(payload.title, "new");
  },
);

Deno.test(
  "savePayload adds no mode the project does not hold in the database",
  async () => {
    const db = fakeDb({ "marketing_work_items:select": { payload: {} } });
    await savePayload(db, "tenant-1", "item-1", { workshop_mode: "auto" });
    assert(!("workshop_mode" in written(db).payload));
  },
);
