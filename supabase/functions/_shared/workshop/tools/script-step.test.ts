import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  APPROVE_SCRIPT,
  CHANGE_SCRIPT,
  SCRIPT_CHOICE,
} from "../script-approval.ts";
import {
  executeApprovedWorkshopTool,
  fakeDb,
  scene,
  videoProject,
} from "./test-fakes.ts";

const beats = [
  {
    start_s: 0,
    end_s: 2,
    narration: "עברתם שבעה קמפיינרים?",
    on_screen: "7 קמפיינרים",
    visual: "פרצופים מתחלפים",
  },
  {
    start_s: 2,
    end_s: 5,
    narration: "קמפיין הוא רק מהלך אחד.",
    on_screen: "מהלך 1 מתוך 5",
    visual: "לוח עם חמישה מהלכים",
  },
];

/** A film whose concept is chosen; `script` is what payload.workshop_script holds. */
function film(script?: Record<string, unknown>, over = {}) {
  const item = videoProject()["marketing_work_items:select"];
  // A film whose script is not settled yet.
  const payload: Record<string, unknown> = { ...item.payload };
  delete payload.workshop_script;
  return {
    "marketing_work_items:select": {
      ...item,
      payload: {
        ...payload,
        ...(script ? { workshop_script: script } : {}),
        ...over,
      },
    },
  };
}

/** A script saved last turn for the chosen concept, not yet approved. */
const waiting = {
  artifact_id: "script-1",
  title: "תחלופה",
  total_s: 5,
  beats,
  concept: "יום אחד",
  saved_turn: "turn-1",
};

const scenes = [
  { visual_prompt: "faces swapping fast", voiceover_text: "משהו אחר" },
  { visual_prompt: "a board of five moves", overlay_text: "כותרת אחרת" },
];

type Db = ReturnType<typeof fakeDb>;

/** What workshop_storyboard answers: the script gate, a refusal or the written storyboard. */
interface Reply {
  needs_input: boolean;
  missing: Array<string>;
  say_to_user: string;
  carmen_next: string;
  script: string;
  success: boolean;
  error: string;
}

const storyboard = (
  db: Db,
  args: Record<string, unknown> = {},
  deps: Record<string, unknown> = {},
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

const tapped = (answer: string) => ({
  lastAssistant: `תסריט · תחלופה\n\n${SCRIPT_CHOICE}`,
  userText: answer,
});

Deno.test(
  "a chosen concept without an approved script gets the script step and no scenes",
  async () => {
    const db = fakeDb(film());
    const gate = await storyboard(db);
    assertStrictEquals(gate.needs_input, true);
    assertEquals(gate.missing, ["script"]);
    // Carmen writes the script before the user is asked anything.
    assertStrictEquals(gate.say_to_user, "");
    assertMatch(gate.carmen_next, /workshop_save_script/);
    assertMatch(gate.carmen_next, /יום אחד/);
    assertStrictEquals(savedScenes(db), undefined);
  },
);

Deno.test("a script not yet approved is shown again, not filmed", async () => {
  const db = fakeDb(film(waiting));
  const gate = await storyboard(db);
  assertEquals(gate.missing, ["script"]);
  assertMatch(gate.script, /קריינות: עברתם שבעה קמפיינרים\?/);
  assertMatch(gate.carmen_next, /script_approved=true/);
  assertStrictEquals(savedScenes(db), undefined);
});

Deno.test(
  "a tapped approval is kept and the scenes say the script's lines",
  async () => {
    const db = fakeDb(film(waiting));
    const written = await storyboard(db, {}, tapped(APPROVE_SCRIPT));
    assertStrictEquals(written.success, true, JSON.stringify(written));
    assertStrictEquals(written.script, "תחלופה");
    const rows = savedScenes(db) ?? [];
    assertEquals(
      rows.map((row) => [row.voiceover_text, row.overlay_text, row.duration_s]),
      beats.map((beat) => [
        beat.narration,
        beat.on_screen,
        beat.end_s - beat.start_s,
      ]),
    );
    assertStrictEquals(savedScript(db)?.approved, true);
  },
);

Deno.test("a change request does not approve the script", async () => {
  const db = fakeDb(film(waiting));
  const gate = await storyboard(db, {}, tapped(CHANGE_SCRIPT));
  assertEquals(gate.missing, ["script"]);
  assertStrictEquals(savedScenes(db), undefined);
  assertStrictEquals(savedScript(db)?.approved === true, false);
});

/** The project as workshop_save_script left it, saving these beats in `turnId`. */
async function savedBy(turnId: string) {
  const db = fakeDb(film());
  await executeApprovedWorkshopTool(
    db,
    "tenant-1",
    "workshop_save_script",
    {
      item_id: "item-1",
      title: "תחלופה",
      beats: beats.map((beat) => ({
        ...beat,
        duration_s: beat.end_s - beat.start_s,
      })),
    },
    async () => {},
    null,
    { turnId },
  );
  return savedScript(db);
}

Deno.test(
  "an approval in words counts only in a later turn than the script was saved",
  async () => {
    const script = await savedBy("turn-1");
    // Carmen saves a script and approves it herself in the same turn: the user never saw it.
    const sameTurn = fakeDb(film(script));
    const gate = await storyboard(
      sameTurn,
      { script_approved: true },
      { turnId: "turn-1" },
    );
    assertEquals(gate.missing, ["script"]);
    assertStrictEquals(savedScenes(sameTurn), undefined);
    const nextTurn = fakeDb(film(script));
    const written = await storyboard(
      nextTurn,
      { script_approved: true },
      { turnId: "turn-2" },
    );
    assertStrictEquals(written.success, true, JSON.stringify(written));
    assertStrictEquals(
      savedScenes(nextTurn)?.[0].voiceover_text,
      beats[0].narration,
    );
  },
);

Deno.test("a script written for another concept is written again", async () => {
  const db = fakeDb(film({ ...waiting, concept: "לילה", approved: true }));
  const gate = await storyboard(db);
  assertEquals(gate.missing, ["script"]);
  assertMatch(gate.carmen_next, /workshop_save_script/);
  assertStrictEquals(gate.script, undefined);
});

Deno.test(
  "with a script, a scene without a picture is refused, not dropped",
  async () => {
    const db = fakeDb(film({ ...waiting, approved: true }));
    const refused = await storyboard(db, {
      scenes: [{ voiceover_text: "x" }, ...scenes],
    });
    assertMatch(refused.error, /סצנה 1: חסר visual_prompt/);
  },
);

Deno.test("an approved script is filmed one scene per line", async () => {
  const db = fakeDb(film({ ...waiting, approved: true }));
  const refused = await storyboard(db, { scenes: [scenes[0]] });
  assertMatch(refused.error, /2 שורות, ונשלחו 1 סצנות/);
  assertStrictEquals(savedScenes(db), undefined);
});

Deno.test("the user's skip goes straight to the scenes", async () => {
  const db = fakeDb(film());
  const written = await storyboard(db, { skip_script: true });
  assertStrictEquals(written.success, true, JSON.stringify(written));
  assertEquals(savedScript(db), { skipped: true });
  // Carmen's own lines stay when there is no script.
  assertStrictEquals(savedScenes(db)?.[0].voiceover_text, "משהו אחר");
});

Deno.test(
  "a film that has scenes, or is cut from the user's materials, is not asked for a script",
  async () => {
    const filmed = fakeDb({
      ...film(),
      "marketing_video_scenes:select": [scene("s-1"), scene("s-2")],
    });
    const replaced = await storyboard(filmed, { replace: true });
    assertStrictEquals(replaced.success, true, JSON.stringify(replaced));
    const edited = fakeDb(film(undefined, { workshop_edit: true }));
    const written = await storyboard(edited);
    assertStrictEquals(written.success, true, JSON.stringify(written));
  },
);

Deno.test(
  "skipping the concepts (the user's own full script) skips the script step too",
  async () => {
    const db = fakeDb(film());
    const written = await storyboard(db, { skip_concepts: true });
    assertStrictEquals(written.success, true, JSON.stringify(written));
    assertEquals(savedScript(db), { skipped: true });
  },
);
