import assert from "node:assert/strict";
import { test } from "node:test";
import { executeWorkshopTool, isWorkshopTool, WORKSHOP_TOOLS } from "./workshop-tools.ts";

type Call = { table: string; op: string; value?: unknown };

/** A chainable stand-in for the Supabase client that records writes and answers reads from a script. */
function fakeDb(script: Record<string, unknown> = {}) {
  const calls: Call[] = [];
  const db = {
    calls,
    from(table: string) {
      let op = "select";
      let value: unknown;
      const answer = () => {
        const key = `${table}:${op}`;
        const data = key in script ? script[key] : op === "insert" ? { id: `${table}-1` } : null;
        return { data, error: null };
      };
      const builder: Record<string, unknown> = {
        insert(v: unknown) {
          op = "insert";
          value = v;
          calls.push({ table, op, value });
          return builder;
        },
        update(v: unknown) {
          op = "update";
          calls.push({ table, op, value: v });
          return builder;
        },
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        order: () => builder,
        single: () => Promise.resolve(answer()),
        maybeSingle: () => Promise.resolve(answer()),
        then: (resolve: (v: unknown) => unknown) => resolve(answer()),
      };
      return builder;
    },
  };
  return db;
}

test("every workshop tool is declared once and recognised", () => {
  const names = WORKSHOP_TOOLS.map((tool) => tool.name);
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.every(isWorkshopTool));
  assert.equal(isWorkshopTool("create_lead"), false);
});

test("starting a project from one sentence decides everything and records the brief page", async () => {
  const db = fakeDb();
  const result = (await executeWorkshopTool(
    db,
    "tenant-1",
    "workshop_start_project",
    { brief: "סרטון קצר של כרמן יושבת ליד מחשב ועובדת" },
    async () => {},
    "user-1",
  )) as Record<string, any>;
  assert.equal(result.success, true);
  assert.equal(result.item_id, "marketing_work_items-1");
  assert.equal(result.decided.format, "9:16");
  assert.equal(result.decided.film.scenes, 5);
  assert.equal(result.workshop.event, "project");

  const item = db.calls.find((c) => c.table === "marketing_work_items");
  const row = item?.value as Record<string, any>;
  assert.equal(row.tenant_id, "tenant-1");
  assert.equal(row.client_id, null);
  assert.equal(row.created_by, "user-1");
  assert.equal(row.target_channel, "video");
  assert.equal(row.payload.project_type, "video");
  assert.equal(row.payload.department, "creative");
  assert.equal(row.payload.intake_source, "carmen");

  const artifact = db.calls.find((c) => c.table === "workshop_artifacts");
  const art = artifact?.value as Record<string, any>;
  assert.equal(art.kind, "brief");
  assert.equal(art.item_id, "marketing_work_items-1");
});

test("a client the caller cannot reach stops the project before anything is written", async () => {
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
  assert.equal(result.error, "אין הרשאה ללקוח הזה");
  assert.equal(db.calls.length, 0);
});

test("an empty brief is refused", async () => {
  const result = (await executeWorkshopTool(
    fakeDb(),
    "tenant-1",
    "workshop_start_project",
    { brief: "   " },
  )) as Record<string, unknown>;
  assert.equal(result.error, "brief נדרש");
});

const project = {
  "marketing_work_items:select": {
    id: "item-1",
    title: "חג שמח",
    client_id: null,
    payload: { format: "1:1", workshop: { formats: ["9:16", "4:5"] } },
  },
};

test("creating images first asks for approval with the cost and spends nothing", async () => {
  let generated = 0;
  const db = fakeDb(project);
  const result = (await executeWorkshopTool(
    db,
    "tenant-1",
    "workshop_make_creative",
    { item_id: "item-1", prompt: "festive table" },
    async () => {},
    null,
    {
      generateImage: async () => {
        generated += 1;
        return { image_url: "https://x/a.png" };
      },
    },
  )) as Record<string, any>;
  assert.equal(result.needs_approval, true);
  assert.deepEqual(result.formats, ["9:16", "4:5"]);
  assert.equal(result.estimated_usd, 0.5);
  assert.equal(generated, 0);
  assert.equal(db.calls.some((c) => c.table === "workshop_artifacts"), false);
});

test("after approval each format becomes a page and a failure is reported, not hidden", async () => {
  const db = fakeDb(project);
  const result = (await executeWorkshopTool(
    db,
    "tenant-1",
    "workshop_make_creative",
    { item_id: "item-1", prompt: "festive table", confirmed: true },
    async () => {},
    null,
    {
      generateImage: async (_prompt, format) =>
        format === "9:16"
          ? { image_url: "https://x/story.png" }
          : { error: "billing hard limit" },
    },
  )) as Record<string, any>;
  assert.equal(result.success, true);
  assert.equal(result.created, 1);
  assert.deepEqual(result.failed, [{ format: "4:5", error: "billing hard limit" }]);
  const written = db.calls.filter((c) => c.table === "workshop_artifacts");
  assert.equal(written.length, 1);
  const row = written[0].value as Record<string, any>;
  assert.equal(row.kind, "image");
  assert.equal(row.folder, "images");
  assert.equal(row.url, "https://x/story.png");
});
