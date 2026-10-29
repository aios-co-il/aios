import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { lastAssistantText, tappedAnswers } from "./tapped-answers.ts";

const asked =
  "בינתיים, באיזו אווירה נלך?\n[[בחירה: אווירה | חם ונינוח | אנרגטי ומהיר]]";

Deno.test(
  "a single tap on Carmen's own question is kept under that question",
  () => {
    assertEquals(tappedAnswers(asked, "חם ונינוח"), { אווירה: "חם ונינוח" });
    assertEquals(tappedAnswers(asked, "משהו אחר לגמרי"), {});
  },
);

Deno.test("several taps arrive as question: answer lines", () => {
  const two = `${asked}\n[[בחירה: סיום | לוגו בלבד | בלי סגיר]]`;
  assertEquals(tappedAnswers(two, "אווירה: אנרגטי ומהיר\nסיום: לוגו בלבד"), {
    אווירה: "אנרגטי ומהיר",
    סיום: "לוגו בלבד",
  });
});

Deno.test("the budget question is not kept in the brief", () => {
  const budget =
    "[[בחירה: לאשר תקציב של $4 לפרויקט? | מאשר תקציב 22B8 | לא עכשיו]]";
  assertEquals(tappedAnswers(budget, "מאשר תקציב 22B8"), {});
});

Deno.test("the last assistant message is read from the chat history", () => {
  assertStrictEquals(
    lastAssistantText([
      { role: "user", content: "שלום" },
      { role: "assistant", content: asked },
      { role: "user", content: "חם ונינוח" },
    ]),
    asked,
  );
  assertStrictEquals(lastAssistantText(null), "");
});
