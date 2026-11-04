import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { executeWorkshopTool, fakeDb } from "./test-fakes.ts";

Deno.test(
  "a project open on the board is continued, not replaced by a new one",
  async () => {
    const db = fakeDb();
    const refused = (await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_start_project",
      { brief: "סרטון של הדמות המסומנת רוקדת" },
      async () => {},
      "user-1",
      { openItemId: "item-open", userText: "תכיני לי סרטון של הדמות המסומנת" },
    )) as Record<string, unknown>;
    assertStrictEquals(refused.open_item_id, "item-open");
    assertStrictEquals(
      db.calls.some((c) => c.op === "insert"),
      false,
    );

    const asked = (await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_start_project",
      { brief: "מודעה לסניף" },
      async () => {},
      "user-1",
      { openItemId: "item-open", userText: "תפתחי פרויקט חדש למודעה לסניף" },
    )) as Record<string, unknown>;
    assertStrictEquals(asked.success, true);
  },
);

Deno.test(
  "starting a project from one sentence decides everything and records the brief page",
  async () => {
    const db = fakeDb();
    const result = (await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_start_project",
      { brief: "סרטון קצר של כרמן יושבת ליד מחשב ועובדת" },
      async () => {},
      "user-1",
    )) as Record<string, any>;
    assertStrictEquals(result.success, true);
    assertStrictEquals(result.item_id, "marketing_work_items-1");
    assertStrictEquals(result.decided.format, "9:16");
    assertStrictEquals(result.decided.film.scenes, 5);
    assertStrictEquals(result.workshop.event, "project");

    const item = db.calls.find((c) => c.table === "marketing_work_items");
    const row = item?.value as Record<string, any>;
    assertStrictEquals(row.tenant_id, "tenant-1");
    assertStrictEquals(row.client_id, null);
    assertStrictEquals(row.created_by, "user-1");
    assertStrictEquals(row.target_channel, "video");
    assertStrictEquals(row.payload.project_type, "video");
    assertStrictEquals(row.payload.department, "creative");
    assertStrictEquals(row.payload.intake_source, "carmen");

    const artifact = db.calls.find((c) => c.table === "workshop_artifacts");
    const art = artifact?.value as Record<string, any>;
    assertStrictEquals(art.kind, "brief");
    assertStrictEquals(art.item_id, "marketing_work_items-1");
  },
);

Deno.test(
  "a client the caller cannot reach stops the project before anything is written",
  async () => {
    const db = fakeDb();
    const result = (await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_start_project",
      { brief: "מודעה", client_id: "client-9" },
      async () => {
        throw new Error("אין הרשאה ללקוח הזה");
      },
    )) as Record<string, unknown>;
    assertStrictEquals(result.error, "אין הרשאה ללקוח הזה");
    assertStrictEquals(db.calls.length, 0);
  },
);

Deno.test(
  "a project started with no client named goes to the client open in the workshop",
  async () => {
    const db = fakeDb({
      "rpc:workshop_creative_stage": {
        pipeline_id: "pipe-1",
        stage_id: "st-1",
      },
    });
    const checked: string[] = [];
    const result = (await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_start_project",
      { brief: "מודעה לחג" },
      async (clientId) => {
        checked.push(clientId);
      },
      "user-1",
      { viewClientId: "client-7" },
    )) as Record<string, any>;
    assertStrictEquals(result.success, true);
    assertEquals(checked, ["client-7"]);
    assertStrictEquals(result.client_known, true);
    assertStrictEquals(result.client_from_view, true);
    const row = db.calls.find((c) => c.table === "marketing_work_items")
      ?.value as Record<string, any>;
    assertStrictEquals(row.client_id, "client-7");
    assertStrictEquals(row.pipeline_id, "pipe-1");
  },
);

Deno.test(
  "a client in view the caller cannot reach starts the project without a client",
  async () => {
    const db = fakeDb();
    const result = (await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_start_project",
      { brief: "מודעה לחג" },
      async () => {
        throw new Error("אין הרשאה ללקוח הזה");
      },
      "user-1",
      { viewClientId: "client-7" },
    )) as Record<string, any>;
    assertStrictEquals(result.success, true);
    assertStrictEquals(result.client_known, false);
    assertMatch(result.client_note, /בלי לקוח/);
    const row = db.calls.find((c) => c.table === "marketing_work_items")
      ?.value as Record<string, any>;
    assertStrictEquals(row.client_id, null);
    assertStrictEquals(
      db.calls.some((c) => c.table === "rpc:workshop_creative_stage"),
      false,
    );
  },
);

Deno.test(
  "a client Carmen names is checked instead of the one in view",
  async () => {
    const checked: string[] = [];
    const result = (await executeWorkshopTool(
      fakeDb(),
      "tenant-1",
      "workshop_start_project",
      { brief: "מודעה", client_id: "client-9" },
      async (clientId) => {
        checked.push(clientId);
        throw new Error("אין הרשאה ללקוח הזה");
      },
      null,
      { viewClientId: "client-7" },
    )) as Record<string, unknown>;
    assertEquals(checked, ["client-9"]);
    assertStrictEquals(result.error, "אין הרשאה ללקוח הזה");
  },
);

Deno.test("an empty brief is refused", async () => {
  const result = (await executeWorkshopTool(
    fakeDb(),
    "tenant-1",
    "workshop_start_project",
    { brief: "   " },
  )) as Record<string, unknown>;
  assertStrictEquals(result.error, "brief נדרש");
});

Deno.test(
  "taps on questions asked before the project existed start its brief",
  async () => {
    const db = fakeDb();
    await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_start_project",
      { brief: "סרטון לכרמן", kind: "video" },
      async () => {},
      null,
      {
        lastAssistant: "[[בחירה: סגיר | לוגו בלבד | בלי סגיר]]",
        userText: "לוגו בלבד",
      },
    );
    const inserted = db.calls.find(
      (c) => c.table === "marketing_work_items" && c.op === "insert",
    )?.value as any;
    assertEquals(inserted.payload.workshop_brief.answers, {
      סגיר: "לוגו בלבד",
    });
    const page = db.calls.find(
      (c) => c.table === "workshop_artifacts" && c.op === "insert",
    )?.value as { meta: { brief: string } };
    assertStrictEquals(
      page.meta.brief,
      "סרטון לכרמן\n\nפרטים שנוספו לבריף:\nסגיר: לוגו בלבד",
    );
  },
);
