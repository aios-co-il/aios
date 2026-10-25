import assert from "node:assert/strict";
import { test } from "node:test";
import { lastAssistantText, tappedAnswers } from "./tapped-answers.ts";

const asked =
  "בינתיים, באיזו אווירה נלך?\n[[בחירה: אווירה | חם ונינוח | אנרגטי ומהיר]]";

test("a single tap on Carmen's own question is kept under that question", () => {
  assert.deepEqual(tappedAnswers(asked, "חם ונינוח"), { אווירה: "חם ונינוח" });
  assert.deepEqual(tappedAnswers(asked, "משהו אחר לגמרי"), {});
});

test("several taps arrive as question: answer lines", () => {
  const two = `${asked}\n[[בחירה: סיום | לוגו בלבד | בלי סגיר]]`;
  assert.deepEqual(
    tappedAnswers(two, "אווירה: אנרגטי ומהיר\nסיום: לוגו בלבד"),
    {
      אווירה: "אנרגטי ומהיר",
      סיום: "לוגו בלבד",
    },
  );
});

test("the budget question is not kept in the brief", () => {
  const budget =
    "[[בחירה: לאשר תקציב של $4 לפרויקט? | מאשר תקציב 22B8 | לא עכשיו]]";
  assert.deepEqual(tappedAnswers(budget, "מאשר תקציב 22B8"), {});
});

test("the last assistant message is read from the chat history", () => {
  assert.equal(
    lastAssistantText([
      { role: "user", content: "שלום" },
      { role: "assistant", content: asked },
      { role: "user", content: "חם ונינוח" },
    ]),
    asked,
  );
  assert.equal(lastAssistantText(null), "");
});
