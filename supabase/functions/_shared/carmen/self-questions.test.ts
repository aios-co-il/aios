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
  "in an AIOS chat David is offered a dev task, sent after his yes in the next message",
  () => {
    const rule = selfQuestionsStanding({
      tier: "full",
      markdownImages: true,
      appChat: true,
    });
    assertMatch(rule, /create_dev_task/);
    assertMatch(rule, /Cursor/);
    assertMatch(rule, /Claude/);
    assertMatch(rule, /בהודעה הבאה/);
    assertMatch(rule, /\[\[בחירה: .*\| כן \| לא\]\]/);
  },
);

Deno.test(
  "on WhatsApp a dev task is only opened and waits for the Command Center",
  () => {
    const rule = selfQuestionsStanding({
      tier: "full",
      markdownImages: false,
      appChat: false,
    });
    assertMatch(rule, /create_dev_task/);
    assertMatch(rule, /מרכז משימות הפיתוח/);
    assertStrictEquals(rule.includes("approve_dev_task"), false);
    assertStrictEquals(rule.includes("[[בחירה"), false);
  },
);

Deno.test("a bug-fix caller is offered only a Cursor bug fix", () => {
  for (const appChat of [true, false]) {
    const rule = selfQuestionsStanding({
      tier: "bugfix",
      markdownImages: true,
      appChat,
    });
    assertMatch(rule, /Cursor בלבד/);
    assertMatch(rule, /רק דיוויד/);
    assertStrictEquals(rule.includes("Cursor או ל-Claude"), false);
  }
});
