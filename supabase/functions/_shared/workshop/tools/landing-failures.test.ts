import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { executeApprovedWorkshopTool, fakeDb } from "./test-fakes.ts";

/** A tool result or a stored row, read loosely in assertions. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- free-form JSON a test reads into
type Loose = Record<string, any>;

const form = { buttonLabel: "לתיאום שיחה", successMessage: "תודה" };
const blocks = [
  { type: "hero", heading: "כותרת", form },
  { type: "leadForm", heading: "השאירו פרטים", form },
];

/** A fake database whose open project is a landing page with the given state. */
function landingDb(state: Record<string, unknown> = {}, type = "landing") {
  return fakeDb({
    "marketing_work_items:select": {
      id: "item-1",
      title: "עמוד לקליניקה",
      client_id: null,
      payload: { project_type: type, landing: state },
    },
  });
}

/** Runs one workshop tool on item-1 and returns its result. */
async function run(
  db: ReturnType<typeof fakeDb>,
  name: string,
  args: Record<string, unknown>,
) {
  return (await executeApprovedWorkshopTool(
    db,
    "tenant-1",
    name,
    { item_id: "item-1", ...args },
    async () => {},
    "user-1",
  )) as Loose;
}

/** The payload a tool wrote to the project, if it wrote one. */
function savedPayload(db: ReturnType<typeof fakeDb>) {
  const update = db.calls.find(
    (call) => call.table === "marketing_work_items" && call.op === "update",
  );
  return (update?.value as { payload?: Loose } | undefined)?.payload;
}

/** Makes every read or write of one table answer with an error. */
function failTable(db: ReturnType<typeof fakeDb>, table: string) {
  const from = db.from.bind(db);
  db.from = (name: string) => {
    const builder = from(name);
    if (name !== table) {
      return builder;
    }
    /** The answer of a table that is down. */
    function failed() {
      return Promise.resolve({
        data: null,
        error: { message: `${table} is down` },
      });
    }
    builder.single = failed;
    builder.maybeSingle = failed;
    builder.then = (resolve: (value: unknown) => unknown) =>
      failed().then(resolve);
    return builder;
  };
  return db;
}

Deno.test(
  "invalid copy writes nothing: no project update and no board page",
  async () => {
    const db = landingDb();
    await run(db, "workshop_save_landing_copy", { blocks: [blocks[0]] });
    assertEquals(
      db.calls.filter((call) => call.op !== "select"),
      [],
    );
  },
);

Deno.test(
  "when the board page cannot be saved, the previous copy is put back",
  async () => {
    const previous = [{ type: "text", body: "הקופי הקודם" }];
    const db = failTable(
      landingDb({ blocks: previous, copy_approved: true }),
      "workshop_artifacts",
    );
    const result = await run(db, "workshop_save_landing_copy", { blocks });
    assertEquals(result.success, undefined);
    assertStringIncludes(result.error, "workshop_artifacts is down");
    const updates = db.calls.filter(
      (call) => call.table === "marketing_work_items" && call.op === "update",
    );
    assertEquals(updates.length, 2);
    const restored = (updates[1].value as Loose).payload.landing;
    assertEquals(restored.blocks, previous);
    assertEquals(restored.copy_approved, true);
  },
);

Deno.test(
  "a project the guard cannot read is refused, not treated as a film",
  async () => {
    const db = failTable(landingDb({ blocks }), "marketing_work_items");
    const result = await run(db, "workshop_storyboard", {});
    assertStringIncludes(result.error, "לא הצלחתי לקרוא את הפרויקט");
    assertEquals(
      db.calls.filter((call) => call.op !== "select"),
      [],
    );
  },
);

Deno.test(
  "a style whose fields are not text is refused, not saved as [object Object]",
  async () => {
    const db = landingDb({ blocks, copy_approved: true });
    const result = await run(db, "workshop_save_landing_style", {
      primary_color: ["#1D6FB8"],
      hero: "dark",
      direction: { mood: "נקי" },
      accents: "#112233",
    });
    assertEquals(result.problems.length, 3);
    assertEquals(savedPayload(db), undefined);
  },
);

Deno.test(
  "a kind the caller names outright is kept; anything else is inferred",
  async () => {
    /** The kind the start tool decides for a brief and a named kind. */
    async function decided(brief: string, kind: unknown) {
      const result = (await executeApprovedWorkshopTool(
        fakeDb(),
        "tenant-1",
        "workshop_start_project",
        { brief, kind },
        async () => {},
        "user-1",
      )) as Loose;
      return result.decided.kind;
    }
    assertEquals(
      await decided("עמוד נחיתה עם סרטון לקליניקה", "video"),
      "video",
    );
    assertEquals(await decided("עמוד נחיתה עם סרטון לקליניקה", 7), "landing");
  },
);

Deno.test(
  "a caller without access to the project's client gets the plain denial",
  async () => {
    const db = fakeDb({
      "marketing_work_items:select": {
        id: "item-1",
        client_id: "client-9",
        payload: { project_type: "landing" },
      },
    });
    const result = (await executeApprovedWorkshopTool(
      db,
      "tenant-1",
      "workshop_storyboard",
      { item_id: "item-1" },
      () => Promise.reject(new Error("denied")),
      "user-1",
    )) as Loose;
    assertEquals(result.error, "אין הרשאה ללקוח הזה");
  },
);
