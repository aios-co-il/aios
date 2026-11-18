import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { fakeDb } from "../tools/test-fakes.ts";
import { COPY_CHOICE } from "./project.ts";
import { landingTurn } from "./turn.ts";

const payload = {
  project_type: "landing",
  landing: { blocks: [{ type: "text", body: "טקסט" }] },
};
const approving = { lastAssistant: COPY_CHOICE, userText: "הקופי מאושר" };

/** A fake database that holds the landing project above. */
function projectDb() {
  return fakeDb({ "marketing_work_items:select": { payload } });
}

Deno.test("landingTurn", async (t) => {
  await t.step(
    "saves a tapped approval and moves Carmen to the style",
    async () => {
      const db = projectDb();
      const lines = await landingTurn(
        db,
        "tenant-1",
        "item-1",
        payload,
        approving,
      );
      assertStringIncludes(lines[1], "workshop_save_landing_style");
      const update = db.calls.find((call) => call.op === "update");
      const saved = update?.value as {
        payload: { landing: { copy_approved: boolean } };
      };
      assertEquals(saved.payload.landing.copy_approved, true);
    },
  );

  await t.step("a message that approves nothing writes nothing", async () => {
    const db = projectDb();
    const lines = await landingTurn(db, "tenant-1", "item-1", payload, {
      lastAssistant: COPY_CHOICE,
      userText: "לתקן",
    });
    assertStringIncludes(lines[1], "הקופי נשמר ועוד לא אושר");
    assertEquals(
      db.calls.some((call) => call.op === "update"),
      false,
    );
  });

  await t.step(
    "an approval that cannot be saved stays pending and Carmen is told",
    async () => {
      const db = fakeDb({ "marketing_work_items:select": null });
      const lines = await landingTurn(
        db,
        "tenant-1",
        "item-1",
        payload,
        approving,
      );
      assertStringIncludes(lines[1], "הקופי נשמר ועוד לא אושר");
      assertStringIncludes(String(lines.at(-1)), "האישור לא נשמר");
    },
  );

  await t.step(
    "a write that fails after the project loads also stays pending",
    async () => {
      const db = projectDb();
      const from = db.from.bind(db);
      db.from = (table: string) => {
        const builder = from(table);
        const update = builder.update as (value: unknown) => typeof builder;
        builder.update = (value: unknown) => {
          const updating = update(value);
          /** The answer of a write the database refuses. */
          function failed() {
            return Promise.resolve({
              data: null,
              error: { message: "write refused" },
            });
          }
          updating.then = (resolve: (answer: unknown) => unknown) =>
            failed().then(resolve);
          updating.single = failed;
          updating.maybeSingle = failed;
          return updating;
        };
        return builder;
      };
      const lines = await landingTurn(
        db,
        "tenant-1",
        "item-1",
        payload,
        approving,
      );
      assertStringIncludes(lines[1], "הקופי נשמר ועוד לא אושר");
      assertStringIncludes(String(lines.at(-1)), "האישור לא נשמר");
    },
  );
});
