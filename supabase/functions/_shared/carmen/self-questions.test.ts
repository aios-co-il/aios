import { assertMatch, assertStrictEquals } from "jsr:@std/assert@1";
import { selfQuestionsStanding } from "./self-questions.ts";

Deno.test(
  "questions about Carmen are answered directly, without a project",
  () => {
    const rule = selfQuestionsStanding(false);
    assertMatch(rule, /get_carmen_skins/);
    assertMatch(rule, /!\[/);
    assertMatch(rule, /workshop_start_project/);
    assertStrictEquals(rule.includes("create_dev_task"), false);
  },
);

Deno.test(
  "only a caller allowed dev tasks is offered one, approved in a later message",
  () => {
    const rule = selfQuestionsStanding(true);
    assertMatch(rule, /create_dev_task/);
    assertMatch(rule, /Cursor/);
    assertMatch(rule, /Claude/);
    assertMatch(rule, /בהודעה הבאה/);
  },
);
