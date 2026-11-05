import {
  assert,
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { APPROVE_SCRIPT, SCRIPT_CHOICE } from "../script-approval.ts";
import { workshopTurnNote } from "../turn-note.ts";
import { NO_CONCEPT } from "./film-concept.ts";
import {
  executeApprovedWorkshopTool,
  fakeDb,
  videoProject,
} from "./test-fakes.ts";

const beats = [
  {
    duration_s: 2,
    narration: "עברתם שבעה קמפיינרים?",
    on_screen: "7 קמפיינרים",
  },
  {
    duration_s: 3,
    narration: "קמפיין הוא רק מהלך אחד.",
    on_screen: "1 מתוך 5",
  },
].map((beat) => ({ ...beat, visual: "motion graphics" }));

const scenes = [
  { visual_prompt: "faces swapping fast", voiceover_text: "משהו אחר" },
  { visual_prompt: "a board of five moves", overlay_text: "כותרת אחרת" },
];

type Db = ReturnType<typeof fakeDb>;
type Payload = Record<string, unknown>;

/** What workshop_save_script and workshop_storyboard answer. */
interface Reply {
  success: boolean;
  already_saved: boolean;
  approved: boolean;
  error: string;
  needs_input: boolean;
  missing: Array<string>;
  say_to_user: string;
  carmen_next: string;
}

/** A film with these brief answers and no script settled yet. */
function project(answers: Record<string, string>, over: Payload = {}): Payload {
  const payload: Payload = {
    ...videoProject()["marketing_work_items:select"].payload,
  };
  delete payload.workshop_script;
  return { ...payload, workshop_brief: { asked: true, answers }, ...over };
}

const dbWith = (payload: Payload) =>
  fakeDb({
    "marketing_work_items:select": {
      ...videoProject()["marketing_work_items:select"],
      payload,
    },
  });

const run = (
  db: Db,
  name: string,
  args: Payload,
  deps: Record<string, unknown>,
) =>
  executeApprovedWorkshopTool(
    db,
    "tenant-1",
    name,
    { item_id: "item-1", ...args },
    async () => {},
    null,
    deps,
  ) as Promise<Reply>;

const saveScript = (db: Db, deps: Record<string, unknown>, lines = beats) =>
  run(db, "workshop_save_script", { title: "תחלופה", beats: lines }, deps);

/** The payload the last project write stored. */
const lastPayload = (db: Db) =>
  (
    db.calls.filter((c) => c.op === "update").at(-1)?.value as
      { payload: Payload } | undefined
  )?.payload;

const scriptOf = (payload: Payload | undefined) =>
  payload?.workshop_script as Record<string, unknown> | undefined;

const pagesSaved = (db: Db) =>
  db.calls.filter((c) => c.table === "workshop_artifacts" && c.op === "insert")
    .length;

Deno.test(
  "save_script without a chosen concept asks for concepts first",
  async () => {
    // Staging, 5 Nov: the user's first message, nothing on the board and no "קונספט" answer.
    const db = dbWith(project({ אורך: "5 שניות" }));
    const refused = await saveScript(db, { turnId: "turn-1" });
    assertStrictEquals(refused.success === true, false);
    assertEquals(refused.missing, ["concept"]);
    assertStrictEquals(refused.say_to_user, "");
    assertMatch(refused.carmen_next, /workshop_save_concepts/);
    assertMatch(refused.carmen_next, /2 עד 3 קונספטים/);
    assertStrictEquals(pagesSaved(db), 0);
    assertStrictEquals(lastPayload(db), undefined);
  },
);

Deno.test(
  "concepts the user explicitly skipped let the script be saved",
  async () => {
    const db = dbWith(project({ קונספט: NO_CONCEPT }));
    const saved = await saveScript(db, { turnId: "turn-1" });
    assertStrictEquals(saved.success, true, JSON.stringify(saved));
    assertStrictEquals(pagesSaved(db), 1);
  },
);

/** Turn 1 saved the script; turn 2's note read the user's tap on its approval line. */
async function approvedByTap() {
  const turn1 = dbWith(project({ קונספט: "תחלופה" }));
  const shown = await saveScript(turn1, { turnId: "turn-1" });
  assert(shown.say_to_user.endsWith(SCRIPT_CHOICE));
  const tap = {
    turnId: "turn-2",
    userText: APPROVE_SCRIPT,
    lastAssistant: shown.say_to_user,
  };
  const turn2 = dbWith(lastPayload(turn1) ?? {});
  const note = await workshopTurnNote(
    turn2,
    "tenant-1",
    "item-1",
    tap.userText,
    tap.lastAssistant,
    null,
    tap.turnId,
  );
  return { payload: lastPayload(turn2) ?? {}, note: note ?? "", tap };
}

Deno.test(
  "an approved script saved again in the approval turn stays approved and is filmed",
  async () => {
    const { payload, note, tap } = await approvedByTap();
    assertStrictEquals(scriptOf(payload)?.approved, true);
    assertStrictEquals(scriptOf(payload)?.approved_turn, "turn-2");
    assertMatch(note, /אל תשמרי אותו שוב/);
    // Carmen calls workshop_save_script again with the same script in that turn.
    const resave = dbWith(payload);
    const kept = await saveScript(resave, tap);
    assertStrictEquals(kept.success, true, JSON.stringify(kept));
    assertStrictEquals(kept.already_saved, true);
    assertStrictEquals(kept.approved, true);
    assertStrictEquals(kept.say_to_user, "");
    assertMatch(kept.carmen_next, /workshop_storyboard/);
    assertStrictEquals(pagesSaved(resave), 0);
    assertStrictEquals(lastPayload(resave), undefined);
    // ...and the storyboard is written from the approved script.
    const board = dbWith(payload);
    const written = await run(board, "workshop_storyboard", { scenes }, tap);
    assertStrictEquals(written.success, true, JSON.stringify(written));
    const rows = (
      board.calls.find((c) => c.table === "rpc:save_video_storyboard")
        ?.value as { p_scenes: Array<Record<string, unknown>> }
    ).p_scenes;
    assertEquals(
      rows.map((row) => row.voiceover_text),
      beats.map((beat) => beat.narration),
    );
  },
);

Deno.test(
  "a different script in the approval turn is refused unless the user asked for changes",
  async () => {
    const { payload, tap } = await approvedByTap();
    const other = [{ ...beats[0], narration: "שורה אחרת לגמרי" }, beats[1]];
    const refused = dbWith(payload);
    const reply = await saveScript(refused, tap, other);
    assertMatch(reply.error, /אישר את התסריט בהודעה הזו/);
    assertMatch(reply.error, /workshop_storyboard/);
    assertStrictEquals(pagesSaved(refused), 0);
    // The user approved and asked for a change in the same message: the new script is saved.
    const changed = dbWith(payload);
    const saved = await saveScript(
      changed,
      { ...tap, userText: "מאושר, רק תחליפי את השורה הראשונה" },
      other,
    );
    assertStrictEquals(saved.success, true, JSON.stringify(saved));
    assertStrictEquals(pagesSaved(changed), 1);
    assertStrictEquals(scriptOf(lastPayload(changed))?.approved, false);
  },
);

Deno.test(
  "the same script saved again while it waits is not saved as a second page",
  async () => {
    const turn1 = dbWith(project({ קונספט: "תחלופה" }));
    await saveScript(turn1, { turnId: "turn-1" });
    const again = dbWith(lastPayload(turn1) ?? {});
    const kept = await saveScript(again, { turnId: "turn-1" });
    assertStrictEquals(kept.already_saved, true, JSON.stringify(kept));
    assertStrictEquals(kept.approved, false);
    assertStrictEquals(pagesSaved(again), 0);
  },
);
