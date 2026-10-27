import {
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { productionReport } from "./production.ts";
import {
  DEFAULT_MUSIC_PROMPT,
  musicPromptFor,
  wantsSoundDesign,
} from "./sound-design.ts";

const withBrief = (film: string, music = "") => ({
  workshop_look: { film },
  ...(music ? { workshop_brief: { answers: { מוזיקה: music } } } : {}),
});

Deno.test(
  "a brief for trailer action music that is not over the top asks for restrained trailer music",
  () => {
    const prompt = musicPromptFor(
      withBrief(
        "סגנון: מצגת של כרמן. מוזיקה: מוזיקת טריילר אקשן, לא מוגזם. סגיר: לוגו וקריאה לפעולה",
      ),
    );
    assertMatch(prompt, /^Restrained cinematic trailer score/);
    assertMatch(prompt, /without ever turning bombastic, loud or over the top/);
    assertMatch(prompt, /no vocals, no lyrics/);
    const english = musicPromptFor(
      {},
      "trailer action music, not over the top",
    );
    assertMatch(english, /^Restrained cinematic trailer score/);
    const loud = musicPromptFor(withBrief("", "טריילר אקשן"));
    assertMatch(loud, /^Cinematic action-trailer score/);
  },
);

Deno.test(
  "other briefs keep their mood, and no brief keeps the old bed",
  () => {
    assertStrictEquals(musicPromptFor({}), DEFAULT_MUSIC_PROMPT);
    const acoustic = musicPromptFor(
      withBrief("קצב: רגוע ורגשי", "אקוסטית חמה"),
    );
    assertMatch(acoustic, /warm acoustic/);
    assertMatch(acoustic, /calm and emotional/);
    assertNotMatch(acoustic, /trailer/);
  },
);

Deno.test(
  "sound design follows the user's choice, then their words, then the brief",
  () => {
    const trailer = withBrief("מוזיקה: טריילר אקשן, לא מוגזם");
    assertStrictEquals(wantsSoundDesign(trailer), true);
    assertStrictEquals(wantsSoundDesign(withBrief("סגנון: קולנועי")), true);
    assertStrictEquals(wantsSoundDesign(withBrief("קצב: רגוע")), false);
    assertStrictEquals(wantsSoundDesign(trailer, { choice: false }), false);
    assertStrictEquals(
      wantsSoundDesign({}, { userText: "תוסיפי סאונד דיזיין" }),
      true,
    );
    assertStrictEquals(
      wantsSoundDesign(trailer, { userText: "בלי אפקטים בבקשה" }),
      false,
    );
  },
);

Deno.test(
  "a film rendered without its sound effects says so in the report",
  () => {
    const report = productionReport(
      [
        {
          kind: "render",
          status: "completed",
          sound_effects_error: "אין מפתח ElevenLabs לאפקטי סאונד",
        },
      ],
      { status: "done" },
    );
    assertMatch(report.summary, /בלי אפקטי סאונד \(אין מפתח ElevenLabs/);
    const fine = productionReport(
      [{ kind: "render", status: "completed", sound_effects_error: null }],
      { status: "done" },
    );
    assertNotMatch(fine.summary, /אפקטי סאונד/);
  },
);
