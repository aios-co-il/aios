import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  answerFor,
  answersFromArgs,
  answersFromMessage,
  briefAnswersOf,
  filmFromAnswers,
  styleFromAnswers,
  topicOf,
  unanswered,
  withBriefAnswers,
} from "./brief-answers.ts";
import { FILM_CHOICES, STYLE_CHOICES } from "./briefing-choices.ts";

Deno.test("a question counts as answered under any of its names", () => {
  for (const name of ["סיום", "סגיר", "סגירה", "קריאה לפעולה"])
    assertStrictEquals(topicOf(name), "סיום", name);
  for (const name of ["קול", "קריינות"])
    assertStrictEquals(topicOf(name), "קול", name);
  for (const name of ["מראה", "סגנון", "סגנון חזותי"])
    assertStrictEquals(topicOf(name), "מראה", name);
  for (const name of ["דמות", "דמויות"])
    assertStrictEquals(topicOf(name), "דמות", name);
  assertStrictEquals(topicOf("אווירה"), "אווירה");
  const answers = {
    סגיר: "לוגו בלבד",
    קריינות: "קריין",
    "סגנון חזותי": "איור מונפש",
    דמויות: "כמה דמויות",
    צבעים: "חם ומזמין",
    מוזיקה: "תזמורתית",
    קצב: "מצחיק וקליל",
  };
  assertStrictEquals(answerFor(answers, "סיום"), "לוגו בלבד");
  assertEquals(
    unanswered([...STYLE_CHOICES.video, ...FILM_CHOICES], answers),
    [],
  );
  assertStrictEquals(
    filmFromAnswers(answers),
    "קצב: מצחיק וקליל. קול: קריין. מוזיקה: תזמורתית. סיום: לוגו בלבד",
  );
  assertStrictEquals(
    styleFromAnswers(answers, "video"),
    "דמות: כמה דמויות. מראה: איור מונפש. צבעים: חם ומזמין",
  );
  assertStrictEquals(styleFromAnswers({ מראה: "x" }, "video"), null);
  // Carmen's own names are read from the user's lines too.
  assertEquals(answersFromMessage("סגיר: בלי סגיר", FILM_CHOICES), {
    סגיר: "בלי סגיר",
  });
});

Deno.test(
  "tapped answers are read by question, unknown lines are ignored",
  () => {
    assertEquals(
      answersFromMessage(
        "קצב: מצחיק וקליל\nקול: דמות שמדברת למצלמה\nסתם שורה: משהו",
        FILM_CHOICES,
      ),
      { קצב: "מצחיק וקליל", קול: "דמות שמדברת למצלמה" },
    );
  },
);

Deno.test(
  "a lone tap counts only when it belongs to exactly one open question",
  () => {
    assertEquals(answersFromMessage("אקוסטית חמה", FILM_CHOICES), {
      מוזיקה: "אקוסטית חמה",
    });
    assertEquals(answersFromMessage("תמשיכי", FILM_CHOICES), {});
  },
);

Deno.test(
  "answers merge into the project brief and fill the film brief once complete",
  () => {
    let payload: Record<string, unknown> = { title: "x" };
    payload = withBriefAnswers(payload, { קצב: "רגוע ורגשי", קול: "קריינית" });
    payload = withBriefAnswers(
      payload,
      answersFromArgs({ מוזיקה: " תזמורתית " }),
    );
    assertStrictEquals(briefAnswersOf(payload).קצב, "רגוע ורגשי");
    assertStrictEquals(filmFromAnswers(briefAnswersOf(payload)), null);
    payload = withBriefAnswers(payload, { סיום: "לוגו בלבד" });
    assertStrictEquals(
      filmFromAnswers(briefAnswersOf(payload)),
      "קצב: רגוע ורגשי. קול: קריינית. מוזיקה: תזמורתית. סיום: לוגו בלבד",
    );
    assertEquals(unanswered(FILM_CHOICES, briefAnswersOf(payload)), []);
  },
);
