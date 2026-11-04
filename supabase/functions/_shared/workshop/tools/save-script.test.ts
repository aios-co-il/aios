import {
  assert,
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { SCRIPT_CHOICE } from "../film-script.ts";
import {
  executeApprovedWorkshopTool,
  fakeDb,
  videoProject,
} from "./test-fakes.ts";

/** A 15-second film (the brief's length answer, as on Staging). */
function film() {
  const item = videoProject()["marketing_work_items:select"];
  // A film whose script is not settled yet.
  const payload: Record<string, unknown> = { ...item.payload };
  delete payload.workshop_script;
  return {
    "marketing_work_items:select": {
      ...item,
      payload: {
        ...payload,
        workshop_brief: {
          asked: true,
          answers: { קונספט: "תחלופה", אורך: "15 שניות, 2.5 שניות לסצנה" },
        },
      },
    },
  };
}

const beat = (duration_s: number, narration: string, on_screen = "") => ({
  duration_s,
  narration,
  on_screen,
  visual: "motion graphics",
});

/** What workshop_save_script answers. */
interface Reply {
  success: boolean;
  error: string;
  total_s: number;
  say_to_user: string;
}

interface SavedScript {
  approved: boolean;
  artifact_id: string;
  beats: Array<{ start_s: number; end_s: number }>;
}

const save = (db: ReturnType<typeof fakeDb>, beats: Array<unknown>) =>
  executeApprovedWorkshopTool(db, "tenant-1", "workshop_save_script", {
    item_id: "item-1",
    title: "תחלופה",
    beats,
  }) as Promise<Reply>;

Deno.test(
  "a script is saved as a page, unapproved, and shown with the approval tap",
  async () => {
    const db = fakeDb(film());
    const saved = await save(db, [
      beat(2, "עברתם שבעה קמפיינרים?", "7 קמפיינרים"),
      beat(5, "קמפיין הוא רק מהלך אחד מתוך חמישה.", "1 מתוך 5"),
      beat(5, "כרמן רואה את כל התמונה.", "כל התמונה"),
      beat(3, "קחו את כרמן לשיווק שלכם.", "קחו את כרמן"),
    ]);
    assertStrictEquals(saved.success, true, JSON.stringify(saved));
    assertStrictEquals(saved.total_s, 15);
    const page = db.calls.find((c) => c.table === "workshop_artifacts")
      ?.value as { kind: string; folder: string; meta: { text: string } };
    assertStrictEquals(page.kind, "script");
    assertStrictEquals(page.folder, "copy");
    assertMatch(page.meta.text, /2–7 שנ׳\nקריינות: קמפיין הוא רק מהלך אחד/);
    const script = (
      db.calls.filter((c) => c.op === "update").at(-1)?.value as {
        payload: { workshop_script: SavedScript };
      }
    ).payload.workshop_script;
    assertStrictEquals(script.approved, false);
    assertStrictEquals(script.artifact_id, "workshop_artifacts-1");
    assertEquals(
      script.beats.map((b) => [b.start_s, b.end_s]),
      [
        [0, 2],
        [2, 7],
        [7, 12],
        [12, 15],
      ],
    );
    // The user reads the script itself and approves it with one tap.
    assert(saved.say_to_user.startsWith("תסריט · תחלופה"));
    assert(saved.say_to_user.endsWith(SCRIPT_CHOICE));
  },
);

Deno.test("a script longer or shorter than the film is refused", async () => {
  const db = fakeDb(film());
  const refused = await save(db, [beat(5, "שלום"), beat(5, "ולהתראות")]);
  assertMatch(refused.error, /סכום השורות 10 שניות, והסרט 15 שניות/);
  assertStrictEquals(
    db.calls.some((c) => c.table === "workshop_artifacts"),
    false,
  );
});

Deno.test("narration that cannot be said in its beat is refused", async () => {
  const db = fakeDb(film());
  const refused = await save(db, [
    beat(2, "זה משפט ארוך מדי בשביל שתי שניות בלבד"),
    beat(13, "סוף"),
  ]);
  assertMatch(refused.error, /שורה 1: 8 מילים .* \(עד 5\)/);
});
