import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  answersFromArgs,
  answersFromMessage,
  briefAnswersOf,
  filmFromAnswers,
  unanswered,
  withBriefAnswers,
} from "./brief-answers.ts";
import { FILM_CHOICES } from "./briefing-choices.ts";

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
