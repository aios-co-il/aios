import {
  assert,
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { asRecord } from "../record.ts";
import {
  APPROVE_SCRIPT,
  SCRIPT_CHOICE,
  SCRIPT_LABEL,
} from "../script-approval.ts";
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

interface Turn {
  turnId: string;
  userText?: string;
  lastAssistant?: string;
}

/** What workshop_save_script and workshop_storyboard answer. */
interface Reply {
  success: boolean;
  already_saved: boolean;
  approved: boolean;
  error: string;
  missing: unknown;
  say_to_user: string;
  carmen_next: string;
}

/** A tool's answer read into Reply's fields. */
function replyOf(value: unknown): Reply {
  const row = asRecord(value);
  return {
    success: row.success === true,
    already_saved: row.already_saved === true,
    approved: row.approved === true,
    error: String(row.error ?? ""),
    missing: row.missing,
    say_to_user: String(row.say_to_user ?? ""),
    carmen_next: String(row.carmen_next ?? ""),
  };
}

/** A film with these brief answers and no script settled yet. */
function project(answers: Record<string, string>): Payload {
  const payload = { ...videoProject()["marketing_work_items:select"].payload };
  return {
    ...payload,
    workshop_script: undefined,
    workshop_brief: { asked: true, answers },
  };
}

const dbWith = (payload: Payload) =>
  fakeDb({
    "marketing_work_items:select": {
      ...videoProject()["marketing_work_items:select"],
      payload,
    },
  });

async function run(db: Db, name: string, args: Payload, turn: Turn) {
  return replyOf(
    await executeApprovedWorkshopTool(
      db,
      "tenant-1",
      name,
      { item_id: "item-1", ...args },
      async () => {},
      null,
      turn,
    ),
  );
}

const saveScript = (db: Db, turn: Turn, lines = beats) =>
  run(db, "workshop_save_script", { title: "תחלופה", beats: lines }, turn);

/** The payload the last project write stored, or null when nothing was written. */
function lastPayload(db: Db): Payload | null {
  const update = db.calls.filter((c) => c.op === "update").at(-1);
  return update ? asRecord(asRecord(update.value).payload) : null;
}

const scriptOf = (payload: Payload | null) =>
  asRecord(payload?.workshop_script);

const pagesSaved = (db: Db) =>
  db.calls.filter((c) => c.table === "workshop_artifacts" && c.op === "insert")
    .length;

/** The narration of each scene the storyboard wrote. */
function narrations(db: Db) {
  const call = db.calls.find((c) => c.table === "rpc:save_video_storyboard");
  const rows = asRecord(call?.value).p_scenes;
  return (Array.isArray(rows) ? rows : []).map(
    (row) => asRecord(row).voiceover_text,
  );
}

/** Turn 1 saved the script; turn 2's note read the user's tap on its approval line. */
async function approvedByTap(userText = APPROVE_SCRIPT) {
  const turn1 = dbWith(project({ קונספט: "תחלופה" }));
  const shown = await saveScript(turn1, { turnId: "turn-1" });
  assert(shown.say_to_user.endsWith(SCRIPT_CHOICE));
  const tap = { turnId: "turn-2", userText, lastAssistant: shown.say_to_user };
  const turn2 = dbWith(lastPayload(turn1) ?? {});
  const note = await workshopTurnNote(
    turn2,
    "tenant-1",
    "item-1",
    tap.userText,
    tap.lastAssistant,
    { turnId: tap.turnId },
  );
  return { payload: lastPayload(turn2) ?? {}, note: note ?? "", tap };
}

describe("workshop_save_script without a chosen concept", () => {
  it("sends Carmen to the concept step in workshop_storyboard", async () => {
    // Staging, 5 Nov: the user's first message, nothing on the board and no "קונספט" answer.
    const db = dbWith(project({ אורך: "5 שניות" }));
    const refused = await saveScript(db, { turnId: "turn-1" });
    assertStrictEquals(refused.success, false);
    assertEquals(refused.missing, ["concept"]);
    assertStrictEquals(refused.say_to_user, "");
    assertMatch(refused.carmen_next, /workshop_storyboard/);
    assertMatch(refused.carmen_next, /skip_concepts=true/);
    assertStrictEquals(pagesSaved(db), 0);
    assertStrictEquals(lastPayload(db), null);
  });

  it("saves the script when the user explicitly skipped concepts", async () => {
    const db = dbWith(project({ קונספט: NO_CONCEPT }));
    const saved = await saveScript(db, { turnId: "turn-1" });
    assertStrictEquals(saved.success, true, JSON.stringify(saved));
    assertStrictEquals(pagesSaved(db), 1);
  });
});

describe("workshop_save_script in the turn the user approved", () => {
  it("keeps the approval for the same script, and the storyboard films it", async () => {
    const { payload, note, tap } = await approvedByTap();
    assertStrictEquals(scriptOf(payload).approved, true);
    assertStrictEquals(scriptOf(payload).approved_turn, "turn-2");
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
    assertStrictEquals(lastPayload(resave), null);
    // ...and the storyboard is written from the approved script.
    const board = dbWith(payload);
    const written = await run(board, "workshop_storyboard", { scenes }, tap);
    assertStrictEquals(written.success, true, JSON.stringify(written));
    assertEquals(
      narrations(board),
      beats.map((beat) => beat.narration),
    );
  });

  it("refuses a different script, even with only the visual changed", async () => {
    const { payload, tap } = await approvedByTap();
    const other = [{ ...beats[0], visual: "close-up" }, beats[1]];
    const refused = dbWith(payload);
    const reply = await saveScript(refused, tap, other);
    assertMatch(reply.error, /אישר את התסריט בהודעה הזו/);
    assertMatch(reply.error, /workshop_storyboard/);
    assertStrictEquals(pagesSaved(refused), 0);
  });

  it("reads a tap on several questions by its script answer", async () => {
    const userText = `${SCRIPT_LABEL}: ${APPROVE_SCRIPT}`;
    const { payload, tap } = await approvedByTap(userText);
    assertStrictEquals(scriptOf(payload).approved, true);
    const other = [{ ...beats[0], narration: "שורה אחרת" }, beats[1]];
    const reply = await saveScript(dbWith(payload), tap, other);
    assertMatch(reply.error, /אישר את התסריט בהודעה הזו/);
  });

  it("saves the new script when the user also asked for a change", async () => {
    const { payload, tap } = await approvedByTap();
    const other = [{ ...beats[0], narration: "שורה אחרת לגמרי" }, beats[1]];
    const changed = dbWith(payload);
    const saved = await saveScript(
      changed,
      { ...tap, userText: "מאושר, רק תחליפי את השורה הראשונה" },
      other,
    );
    assertStrictEquals(saved.success, true, JSON.stringify(saved));
    assertStrictEquals(pagesSaved(changed), 1);
    assertStrictEquals(scriptOf(lastPayload(changed)).approved, false);
  });
});

describe("the same script saved again while it waits", () => {
  it("is not a second page, and comes back with the buttons in a later turn", async () => {
    const turn1 = dbWith(project({ קונספט: "תחלופה" }));
    await saveScript(turn1, { turnId: "turn-1" });
    const stored = lastPayload(turn1) ?? {};
    const sameTurn = dbWith(stored);
    const kept = await saveScript(sameTurn, { turnId: "turn-1" });
    assertStrictEquals(kept.already_saved, true, JSON.stringify(kept));
    assertStrictEquals(kept.approved, false);
    assertStrictEquals(kept.say_to_user, "");
    assertStrictEquals(pagesSaved(sameTurn), 0);
    const later = await saveScript(dbWith(stored), { turnId: "turn-2" });
    assert(later.say_to_user.startsWith("תסריט · תחלופה"));
    assert(later.say_to_user.endsWith(SCRIPT_CHOICE));
  });
});
