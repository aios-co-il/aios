import {
  assert,
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  executeApprovedWorkshopTool,
  fakeDb,
  videoProject,
} from "./test-fakes.ts";

Deno.test(
  "concepts become one page each and need nothing from the user",
  async () => {
    const db = fakeDb(videoProject());
    const result = (await executeApprovedWorkshopTool(
      db,
      "tenant-1",
      "workshop_save_concepts",
      {
        item_id: "item-1",
        concepts: [
          { title: "יום אחד", idea: "מסע של יום עבודה", visual: "אור בוקר" },
          { title: "", idea: "בלי כותרת" },
        ],
      },
    )) as Record<string, any>;
    assertStrictEquals(result.saved, 1);
    const row = db.calls.find((c) => c.table === "workshop_artifacts")
      ?.value as Record<string, any>;
    assertStrictEquals(row.kind, "concept");
    assertStrictEquals(row.folder, "copy");
    assertMatch(row.meta.text, /ויזואל: אור בוקר/);
  },
);

type Db = ReturnType<typeof fakeDb>;

/** What workshop_storyboard answers at the concept and script steps. */
interface GateReply {
  needs_input?: boolean;
  missing?: Array<string>;
  say_to_user: string;
  carmen_next: string;
}

/** A project write, as the fake client records it. */
interface ProjectWrite {
  payload?: { workshop_brief?: { answers?: Record<string, string> } };
}

/** A briefed film with no concept chosen yet; `concepts` are the concept pages on its board. */
function unchosen(
  concepts: Array<{ id?: string; title: string; meta: unknown }> = [],
) {
  const item = videoProject()["marketing_work_items:select"];
  const payload: Record<string, unknown> = {
    ...item.payload,
    workshop_brief: { asked: true, answers: {} },
  };
  delete payload.workshop_script;
  return {
    "marketing_work_items:select": { ...item, payload },
    "workshop_artifacts:select": concepts,
  };
}

/** workshop_storyboard in a later turn, with what the user said and Carmen last asked. */
const storyboardCall = (
  db: Db,
  args: Record<string, unknown>,
  deps: { userText: string; lastAssistant: string; markedArtifactId?: string },
) =>
  executeApprovedWorkshopTool(
    db,
    "tenant-1",
    "workshop_storyboard",
    { item_id: "item-1", scenes: [{ visual_prompt: "x" }], ...args },
    async () => {},
    null,
    { turnId: "turn-2", ...deps },
  ) as Promise<GateReply>;

/** The brief answers of the last project write, if any. */
const savedAnswers = (db: Db) =>
  (
    db.calls
      .filter((c) => c.table === "marketing_work_items" && c.op === "update")
      .at(-1)?.value as ProjectWrite | undefined
  )?.payload?.workshop_brief?.answers ?? {};

Deno.test(
  "a concept Carmen made up is refused after the user tapped her own script button",
  async () => {
    // Staging, 5 Nov: she wrote a script in her reply, the user tapped her approval button, and
    // she passed her own title as the concept, which skipped the user's choice.
    const db = fakeDb(unchosen());
    const result = await storyboardCall(
      db,
      { concept: "שגרה שמתפרקת" },
      {
        userText: "מאשרת, אפשר להמשיך",
        lastAssistant:
          "| שנייה | קריינות |\n[[בחירה: אישור התסריט | מאשרת, אפשר להמשיך | לתקן]]",
      },
    );
    assertStrictEquals(result.needs_input, true);
    assertEquals(result.missing, ["concept"]);
    assertMatch(result.carmen_next, /המשתמש לא בחר אותו/);
    assertMatch(result.carmen_next, /workshop_save_concepts/);
    assertEquals(savedAnswers(db).קונספט, undefined);
    assert(!db.calls.some((c) => c.table === "rpc:save_video_storyboard"));
  },
);

Deno.test(
  "a concept Carmen made up in brief_answers is not saved to the brief",
  async () => {
    const db = fakeDb(unchosen([{ title: "יום אחד", meta: { text: "" } }]));
    const result = await storyboardCall(
      db,
      { brief_answers: { קונספט: "שגרה שמתפרקת" } },
      { userText: "סרטון לחג", lastAssistant: "" },
    );
    assertEquals(result.missing, ["concept"]);
    assertMatch(result.say_to_user, /איזה קונספט מאשרים/);
    assertEquals(savedAnswers(db).קונספט, undefined);
  },
);

Deno.test(
  "a concept the user picked in words from the concept question goes on to the script",
  async () => {
    const db = fakeDb(
      unchosen([
        { title: "יום אחד", meta: { text: "מסע של יום עבודה" } },
        { title: "לילה", meta: { text: "משמרת לילה" } },
      ]),
    );
    const result = await storyboardCall(
      db,
      { concept: "יום אחד" },
      {
        userText: "הראשון",
        lastAssistant:
          "לפני התסריט, איזה קונספט מאשרים?\n[[בחירה: קונספט | יום אחד | לילה]]",
      },
    );
    assertEquals(result.missing, ["script"]);
    assertMatch(result.carmen_next, /מסע של יום עבודה/);
    assertEquals(savedAnswers(db).קונספט, "יום אחד");
  },
);

Deno.test(
  "a concept the user described in their own words counts as their choice",
  async () => {
    const db = fakeDb(unchosen());
    const result = await storyboardCall(
      db,
      { concept: "כלב שרץ בפארק ומוצא את המוצר" },
      {
        userText: "הרעיון שלי: כלב שרץ בפארק ומוצא את המוצר שלנו",
        lastAssistant: "",
      },
    );
    assertEquals(result.missing, ["script"]);
    assertEquals(savedAnswers(db).קונספט, "כלב שרץ בפארק ומוצא את המוצר");
  },
);

Deno.test(
  "a skip_concepts the user did not ask for is refused with the next step",
  async () => {
    // Review of 5 Nov: skip_concepts became the "no concept" answer on any message.
    const db = fakeDb(unchosen());
    const result = await storyboardCall(
      db,
      { skip_concepts: true },
      { userText: "סרטון לפסח על מבצע חיסכון למשפחות", lastAssistant: "" },
    );
    assertEquals(result.missing, ["concept"]);
    assertMatch(result.carmen_next, /skip_concepts לא נשמר/);
    assertMatch(result.carmen_next, /בלי קונספט, ישר לסצנות/);
    assertEquals(savedAnswers(db).קונספט, undefined);
  },
);

Deno.test("a skip_concepts the user asked for is saved", async () => {
  const db = fakeDb(unchosen());
  const result = await storyboardCall(
    db,
    { skip_concepts: true, skip_script: true },
    { userText: "בלי קונספטים ובלי תסריט, ישר לסצנות", lastAssistant: "" },
  );
  assertStrictEquals(result.needs_input, undefined, JSON.stringify(result));
  assertMatch(savedAnswers(db).קונספט ?? "", /בלי קונספט/);
});

Deno.test(
  "the marked concept page's title is the user's approval of it",
  async () => {
    // The marked-page note tells Carmen to pass concept=<name> when the user approves it, with
    // no concept question in her last message.
    const db = fakeDb(
      unchosen([
        {
          id: "concept-1",
          title: "יום אחד",
          meta: { text: "מסע של יום עבודה" },
        },
        { id: "concept-2", title: "לילה", meta: { text: "משמרת לילה" } },
      ]),
    );
    const approved = await storyboardCall(
      db,
      { concept: "יום אחד" },
      { userText: "מאשרת", lastAssistant: "", markedArtifactId: "concept-1" },
    );
    assertEquals(approved.missing, ["script"]);
    assertEquals(savedAnswers(db).קונספט, "יום אחד");
  },
);

Deno.test("another concept than the marked page is still refused", async () => {
  const db = fakeDb(
    unchosen([
      { id: "concept-1", title: "יום אחד", meta: { text: "" } },
      { id: "concept-2", title: "לילה", meta: { text: "" } },
    ]),
  );
  const refused = await storyboardCall(
    db,
    { concept: "לילה" },
    { userText: "מאשרת", lastAssistant: "", markedArtifactId: "concept-1" },
  );
  assertEquals(refused.missing, ["concept"]);
  assertMatch(refused.carmen_next, /המילים שלו בדיוק/);
  assertEquals(savedAnswers(db).קונספט, undefined);
});
