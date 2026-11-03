import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  executeApprovedWorkshopTool,
  fakeDb,
  videoProject,
} from "./test-fakes.ts";

// A skip of the script step counts only when the user asked for it (skip-request.ts).

/** A film whose concept is chosen and whose script is not written yet. */
function film() {
  const item = videoProject()["marketing_work_items:select"];
  const payload: Record<string, unknown> = { ...item.payload };
  delete payload.workshop_script;
  return { "marketing_work_items:select": { ...item, payload } };
}

const scenes = [
  { visual_prompt: "faces swapping fast", voiceover_text: "משהו אחר" },
  { visual_prompt: "a board of five moves", overlay_text: "כותרת אחרת" },
];

type Db = ReturnType<typeof fakeDb>;

/** What workshop_storyboard answers: the script gate or the written storyboard. */
interface Reply {
  needs_input: boolean;
  missing: Array<string>;
  carmen_next: string;
  success: boolean;
}

const storyboard = (
  db: Db,
  args: Record<string, unknown>,
  deps: Record<string, unknown>,
) =>
  executeApprovedWorkshopTool(
    db,
    "tenant-1",
    "workshop_storyboard",
    { item_id: "item-1", scenes, ...args },
    async () => {},
    null,
    deps,
  ) as Promise<Reply>;

const savedScenes = (db: Db) =>
  (
    db.calls.find((c) => c.table === "rpc:save_video_storyboard")?.value as
      { p_scenes: Array<Record<string, unknown>> } | undefined
  )?.p_scenes;

const savedScript = (db: Db) =>
  (
    db.calls.filter((c) => c.op === "update").at(-1)?.value as {
      payload: { workshop_script?: Record<string, unknown> };
    }
  )?.payload.workshop_script;

Deno.test("the user's skip goes straight to the scenes", async () => {
  const db = fakeDb(film());
  const written = await storyboard(
    db,
    { skip_script: true },
    { userText: "בלי תסריט, ישר לסצנות" },
  );
  assertStrictEquals(written.success, true, JSON.stringify(written));
  assertEquals(savedScript(db), { skipped: true });
  // Carmen's own lines stay when there is no script.
  assertStrictEquals(savedScenes(db)?.[0].voiceover_text, "משהו אחר");
});

Deno.test(
  "skipping the concepts (the user's own full script) skips the script step too",
  async () => {
    const db = fakeDb(film());
    const written = await storyboard(
      db,
      { skip_concepts: true },
      { userText: "בלי קונספט, ישר לסצנות" },
    );
    assertStrictEquals(written.success, true, JSON.stringify(written));
    assertEquals(savedScript(db), { skipped: true });
  },
);

Deno.test(
  "a skip_script the user did not ask for is refused with the next step",
  async () => {
    // Review of 5 Nov: Carmen's skip_script went through on any message.
    const db = fakeDb(film());
    const refused = await storyboard(
      db,
      { skip_script: true },
      { userText: "מעולה, תמשיכי" },
    );
    assertEquals(refused.missing, ["script"]);
    assertMatch(refused.carmen_next, /skip_script לא נשמר/);
    assertMatch(refused.carmen_next, /workshop_save_script/);
    assertStrictEquals(savedScenes(db), undefined);
  },
);

Deno.test(
  "the user's own full script in the message skips the script",
  async () => {
    const db = fakeDb(film());
    const written = await storyboard(
      db,
      { skip_script: true },
      {
        userText: [
          "פתיחה: פרצופים מתחלפים, שבעה קמפיינרים בשנה",
          "קריינות: קמפיין הוא רק מהלך אחד מתוך חמישה",
          "סיום: לוח עם חמישה מהלכים והלוגו שלנו",
        ].join("\n"),
      },
    );
    assertStrictEquals(written.success, true, JSON.stringify(written));
    assertEquals(savedScript(db), { skipped: true });
  },
);
