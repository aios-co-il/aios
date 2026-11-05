import { assertStrictEquals } from "jsr:@std/assert@1";
import {
  isExplicitDevTaskDecline,
  offersDevTask,
} from "./dev-task-approval-words.ts";

const OFFER =
  "פתחתי משימה ל-Cursor לתקן את הכפתור. [[בחירה: לשלוח את משימת הפיתוח? | כן | לא]]";

Deno.test("Carmen's dev-task choices are offers; other choices are not", () => {
  for (const text of [
    OFFER,
    "[[בחירה: לשלוח לקרסר? | כן, לשלוח | לא]]",
    "[[בחירה: להעביר לפיתוח? | כן | עוד לא]]",
    "[[choice: Send to Claude? | yes | no]]",
    "[[בחירה: לשלוח לגרוק? | כן | לא]]",
  ])
    assertStrictEquals(offersDevTask(text), true, text);
  for (const text of [
    "",
    "[[בחירה: להמשיך? | כן | לא]]",
    "[[בחירה: סגנון | מינימלי | צבעוני]]",
    "[[בחירה: לשלוח את משימת הפיתוח? | אחר כך | עוד לא]]",
    // "מנוסה" (experienced) is not Manus.
    "[[בחירה: לחפש קופירייטרית מנוסה? | כן | לא]]",
    "רוצה שאפתח משימת פיתוח?",
  ])
    assertStrictEquals(offersDevTask(text), false, text);
});

Deno.test("a plain no declines the offered task; a question does not", () => {
  for (const text of [
    "לא",
    "לא.",
    "לא, עוד לא",
    "לא תודה",
    "אל תשלחי",
    "ביטול",
    "no",
  ])
    assertStrictEquals(isExplicitDevTaskDecline(text), true, text);
  for (const text of [
    "כן",
    "עוד לא",
    "רגע",
    "לא יודעת, מה את ממליצה לעשות?",
    "יש לך גישה לתמונות של הסקינים שלך?",
  ])
    assertStrictEquals(isExplicitDevTaskDecline(text), false, text);
});
