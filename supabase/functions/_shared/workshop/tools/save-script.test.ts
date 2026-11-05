import {
  assert,
  assertEquals,
  assertMatch,
  assertStrictEquals,
  assertStringIncludes,
} from "jsr:@std/assert@1";
import { SCRIPT_CHOICE } from "../script-approval.ts";
import { PACE_GUIDE } from "../script-pace.ts";
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
  saved_turn: string;
  concept: string;
  artifact_id: string;
  beats: Array<{ start_s: number; end_s: number }>;
}

const save = (db: ReturnType<typeof fakeDb>, beats: Array<unknown>) =>
  executeApprovedWorkshopTool(
    db,
    "tenant-1",
    "workshop_save_script",
    { item_id: "item-1", title: "תחלופה", beats },
    async () => {},
    null,
    { turnId: "turn-1" },
  ) as Promise<Reply>;

Deno.test(
  "a script is saved as a page, unapproved, and shown with the approval tap",
  async () => {
    const db = fakeDb(film());
    const saved = await save(db, [
      beat(2, "עברתם שבעה קמפיינרים?", "7 קמפיינרים"),
      beat(5, "קמפיין הוא רק מהלך אחד מתוך חמישה שהעסק צריך.", "1 מתוך 5"),
      beat(5, "כרמן רואה את כל התמונה ומחברת את כל החלקים.", "כל התמונה"),
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
    // The turn it was saved in: an approval in words counts only after it (script-step.ts).
    assertStrictEquals(script.saved_turn, "turn-1");
    assertStrictEquals(script.concept, "תחלופה");
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
  // Eight words and the line's end in a 2-second beat: (2 - 0.3) x 2 words fit.
  assertMatch(
    refused.error,
    /^הקריינות ארוכה מהזמן של השורה: שורה 1: 8 מילים נאמרות בכ-4.3 שניות, וב-2 שניות נכנסות עד 3\. /,
  );
});

// The Staging film of 5 Nov: six 2.5-second beats that passed at 2.5 words a second, and a
// take that ran 17.7 seconds, so the 15-second film rendered at 18.3.
Deno.test("lines the voice cannot say in 2.5 seconds are refused", async () => {
  const lines = [
    "עברתם 7 קמפיינרים?",
    "הקמפיינר ה-8 לא ישנה את התמונה.",
    "קמפיין הוא מהלך אחד.",
    "ולכל עסק יש לפחות 5 מהלכים.",
    "שיווק, מכירות, לידים, תוכן, SEO.",
    "כרמן רואה את כולם.",
  ];
  const db = fakeDb(film());
  const refused = await save(
    db,
    lines.map((line) => beat(2.5, line)),
  );
  // Every line that does not fit, at once, with the most words its beat can say.
  assertMatch(
    refused.error,
    /: שורה 2: 6 מילים נאמרות בכ-3.3 שניות, וב-2.5 שניות נכנסות עד 4; שורה 4: 6 מילים נאמרות בכ-3.3 שניות, וב-2.5 שניות נכנסות עד 4; שורה 5: 5 מילים נאמרות בכ-4.2 שניות, וב-2.5 שניות נכנסות עד 1\. /,
  );
  const list = await save(fakeDb(film()), [
    beat(2.5, "קמפיין הוא מהלך אחד."),
    beat(2.5, "שיווק, מכירות, לידים, תוכן, SEO."),
    beat(10, "כרמן רואה את כולם."),
  ]);
  assertMatch(list.error, /: שורה 2: 5 מילים נאמרות בכ-4.2 שניות/);
  // The refusal states the same limit Carmen was told before writing (SCRIPT_GUIDE).
  assertStringIncludes(list.error, PACE_GUIDE);
});

Deno.test(
  "a narration well short of the film is refused with the beats that can say more",
  async () => {
    // Staging, 5 Nov: this script spoke about 11 of its 15 seconds and the film came out 13.2.
    const db = fakeDb(film());
    const saved = await save(db, [
      beat(3, "קמפיין הוא מהלך אחד."),
      beat(3, "ולעסק יש חמישה."),
      beat(3, "קופי, מדיה, מכירות."),
      beat(3, "ודאטה, שמחברת הכול."),
      beat(3, "כרמן מנהלת את הכול."),
    ]);
    assertStringIncludes(saved.error, "הקריינות קצרה מדי");
    assertStringIncludes(saved.error, "שורה 2: 3 מילים, ונכנסות עד 5");
    // A beat one word short of its most is listed too: every word that fits counts.
    assertStringIncludes(saved.error, "שורה 1: 4 מילים, ונכנסות עד 5");
    assertStrictEquals(
      db.calls.some((c) => c.table === "workshop_artifacts"),
      false,
    );
  },
);

Deno.test("beats filled to within a word of their most are saved", async () => {
  const db = fakeDb(film());
  const saved = await save(db, [
    beat(3, "קמפיין הוא רק מהלך אחד."),
    beat(3, "ולעסק שלכם יש חמישה תחומים."),
    beat(3, "קופי, מדיה, מכירות ודאטה."),
    beat(3, "שמחברת את הכול יחד."),
    beat(3, "כרמן מנהלת את הכול."),
  ]);
  assertStrictEquals(saved.success, true, JSON.stringify(saved));
});
