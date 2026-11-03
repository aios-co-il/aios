import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  APPROVE_SCRIPT,
  CHANGE_SCRIPT,
  SCRIPT_CHOICE,
  SCRIPT_LABEL,
  scriptApprovedByTap,
} from "./script-approval.ts";
import { tappedAnswers } from "./tapped-answers.ts";

const shown = `תסריט · תחלופה\n\n${SCRIPT_CHOICE}`;

Deno.test("only a clean approval of the script question approves it", () => {
  assertStrictEquals(scriptApprovedByTap(shown, APPROVE_SCRIPT), true);
  assertStrictEquals(
    scriptApprovedByTap(shown, `${SCRIPT_LABEL}: מאושר`),
    true,
  );
  assertStrictEquals(scriptApprovedByTap(shown, CHANGE_SCRIPT), false);
  assertStrictEquals(
    scriptApprovedByTap(shown, "מאושר אבל תחליפי את שורה 2"),
    false,
  );
  // An approval of another question is not an approval of the script.
  assertStrictEquals(
    scriptApprovedByTap("[[בחירה: קונספט | כן | לא]]", "כן"),
    false,
  );
});

Deno.test("the script question's answer is not kept in the brief", () => {
  assertEquals(tappedAnswers(shown, APPROVE_SCRIPT), {});
  assertEquals(
    tappedAnswers(`${shown}\n[[בחירה: קצב | מהיר | רגוע]]`, "קצב: מהיר"),
    { קצב: "מהיר" },
  );
});
