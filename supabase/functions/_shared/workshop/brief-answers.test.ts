import assert from "node:assert/strict";
import { test } from "node:test";
import {
  answersFromArgs,
  answersFromMessage,
  briefAnswersOf,
  filmFromAnswers,
  unanswered,
  withBriefAnswers,
} from "./brief-answers.ts";
import { FILM_CHOICES } from "./briefing-choices.ts";

test("tapped answers are read by question, unknown lines are ignored", () => {
  assert.deepEqual(
    answersFromMessage(
      "קצב: מצחיק וקליל\nקול: דמות שמדברת למצלמה\nסתם שורה: משהו",
      FILM_CHOICES,
    ),
    { קצב: "מצחיק וקליל", קול: "דמות שמדברת למצלמה" },
  );
});

test("a lone tap counts only when it belongs to exactly one open question", () => {
  assert.deepEqual(answersFromMessage("אקוסטית חמה", FILM_CHOICES), {
    מוזיקה: "אקוסטית חמה",
  });
  assert.deepEqual(answersFromMessage("תמשיכי", FILM_CHOICES), {});
});

test("answers merge into the project brief and fill the film brief once complete", () => {
  let payload: Record<string, unknown> = { title: "x" };
  payload = withBriefAnswers(payload, { קצב: "רגוע ורגשי", קול: "קריינית" });
  payload = withBriefAnswers(
    payload,
    answersFromArgs({ מוזיקה: " תזמורתית " }),
  );
  assert.equal(briefAnswersOf(payload).קצב, "רגוע ורגשי");
  assert.equal(filmFromAnswers(briefAnswersOf(payload)), null);
  payload = withBriefAnswers(payload, { סיום: "לוגו בלבד" });
  assert.equal(
    filmFromAnswers(briefAnswersOf(payload)),
    "קצב: רגוע ורגשי. קול: קריינית. מוזיקה: תזמורתית. סיום: לוגו בלבד",
  );
  assert.deepEqual(unanswered(FILM_CHOICES, briefAnswersOf(payload)), []);
});
