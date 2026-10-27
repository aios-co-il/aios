import { assertMatch, assertStrictEquals } from "jsr:@std/assert@1";
import { selfQuestionsStanding } from "./self-questions.ts";

Deno.test(
  "questions about Carmen are answered directly, without a project",
  () => {
    const rule = selfQuestionsStanding({ tier: null, markdownImages: true });
    assertMatch(rule, /get_carmen_skins/);
    assertMatch(rule, /!\[/);
    assertMatch(rule, /workshop_start_project/);
    assertStrictEquals(rule.includes("create_dev_task"), false);
  },
);

Deno.test("a chat without Markdown images gets the links instead", () => {
  const rule = selfQuestionsStanding({ tier: null, markdownImages: false });
  assertMatch(rule, /portrait_url/);
  assertStrictEquals(rule.includes("!["), false);
});

Deno.test(
  "in the workshop David is offered a dev task, sent after his yes in the next message",
  () => {
    const rule = selfQuestionsStanding({
      tier: "full",
      markdownImages: true,
      inWorkshop: true,
    });
    assertMatch(rule, /create_dev_task/);
    assertMatch(rule, /Cursor/);
    assertMatch(rule, /Claude/);
    assertMatch(rule, /בהודעה הבאה/);
    assertMatch(rule, /\[\[בחירה: .*\| כן \| לא\]\]/);
  },
);

Deno.test(
  "outside the workshop the usual dev-task flow is left as it is",
  () => {
    const rule = selfQuestionsStanding({ tier: "full", markdownImages: true });
    assertMatch(rule, /create_dev_task/);
    assertStrictEquals(rule.includes("בהודעה הבאה"), false);
    assertStrictEquals(rule.includes("[[בחירה"), false);
  },
);

Deno.test("a bug-fix caller is offered only a Cursor bug fix", () => {
  for (const inWorkshop of [true, false]) {
    const rule = selfQuestionsStanding({
      tier: "bugfix",
      markdownImages: true,
      inWorkshop,
    });
    assertMatch(rule, /Cursor בלבד/);
    assertMatch(rule, /רק דיוויד/);
    assertStrictEquals(rule.includes("Cursor או ל-Claude"), false);
  }
});
