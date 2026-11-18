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

Deno.test(
  "starting a landing page project sets its type, channel and department",
  async () => {
    const db = fakeDb();
    const result = (await executeApprovedWorkshopTool(
      db,
      "tenant-1",
      "workshop_start_project",
      { brief: "עמוד נחיתה לקליניקת שיניים" },
      async () => {},
      "user-1",
    )) as Loose;
    assertEquals(result.success, true);
    assertEquals(result.decided.kind, "landing");
    const row = db.calls.find((call) => call.table === "marketing_work_items")
      ?.value as Loose;
    assertEquals(row.target_channel, "landing");
    assertEquals(row.payload.project_type, "landing");
    assertEquals(row.payload.department, "web");
  },
);

Deno.test("workshop_save_landing_copy", async (t) => {
  await t.step(
    "saves the sections unapproved and shows them with the approval question",
    async () => {
      const db = landingDb({ copy_approved: true });
      const result = await run(db, "workshop_save_landing_copy", { blocks });
      assertEquals(result.success, true);
      assertEquals(result.sections, 2);
      assertStringIncludes(
        result.say_to_user,
        "[[בחירה: הקופי | הקופי מאושר | לתקן]]",
      );
      const landing = savedPayload(db)?.landing;
      assertEquals(landing.blocks.length, 2);
      assertEquals(landing.copy_approved, false);
      const page = db.calls.find((call) => call.table === "workshop_artifacts")
        ?.value as Loose;
      assertEquals(page.kind, "landing_copy");
    },
  );

  await t.step(
    "refuses a page the template cannot render, saving nothing",
    async () => {
      const db = landingDb();
      const result = await run(db, "workshop_save_landing_copy", {
        blocks: [blocks[0]],
      });
      assertStringIncludes(result.problems[0], "leadForm");
      assertEquals(savedPayload(db), undefined);
    },
  );

  await t.step("refuses a project that is not a landing page", async () => {
    const result = await run(
      landingDb({}, "static"),
      "workshop_save_landing_copy",
      {
        blocks,
      },
    );
    assertStringIncludes(result.error, "אינו עמוד נחיתה");
  });
});

Deno.test("workshop_save_landing_style", async (t) => {
  const style = {
    primary_color: "#1D6FB8",
    hero: "dark",
    direction: "נקי ויוקרתי",
  };

  await t.step("waits for the copy to be approved", async () => {
    const db = landingDb({ blocks });
    const result = await run(db, "workshop_save_landing_style", style);
    assertStringIncludes(result.error, "הקופי עוד לא אושר");
    assertEquals(savedPayload(db), undefined);
  });

  await t.step(
    "saves the style unapproved and shows it with the approval question",
    async () => {
      const db = landingDb({ blocks, copy_approved: true });
      const result = await run(db, "workshop_save_landing_style", style);
      assertEquals(result.success, true);
      assertStringIncludes(
        result.say_to_user,
        "[[בחירה: הסגנון | הסגנון מאושר | לתקן]]",
      );
      const landing = savedPayload(db)?.landing;
      assertEquals(landing.style.primaryColor, "#1D6FB8");
      assertEquals(landing.style_approved, false);
      assertEquals(landing.copy_approved, true);
    },
  );

  await t.step("refuses a colour that is not a hex colour", async () => {
    const db = landingDb({ blocks, copy_approved: true });
    const result = await run(db, "workshop_save_landing_style", {
      ...style,
      primary_color: "כחול",
    });
    assertStringIncludes(result.problems[0], "primary_color");
  });
});

Deno.test(
  "picture and film tools are refused on a landing page project",
  async () => {
    for (const name of ["workshop_storyboard", "workshop_make_creative"]) {
      const db = landingDb({ blocks });
      const result = await run(db, name, {});
      assertStringIncludes(result.error, "זה פרויקט עמוד נחיתה");
      assertEquals(savedPayload(db), undefined);
    }
  },
);

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
