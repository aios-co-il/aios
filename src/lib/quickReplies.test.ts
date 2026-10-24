import assert from "node:assert/strict";
import { test } from "node:test";
import {
  answerableIndex,
  hidePartialQuickReplies,
  parseQuickReplies,
  quickReplyAnswer,
} from "./quickReplies.ts";

test("markers become button groups and disappear from the text", () => {
  const { text, groups } = parseQuickReplies(
    "כמה שאלות:\n\n[[בחירה: סגנון | ריאליסטי | קולנועי | איור]]\n[[בחירה: מנוע | Google | ElevenLabs]]\n\nמה דעתך?",
  );
  assert.equal(text, "כמה שאלות:\n\nמה דעתך?");
  assert.deepEqual(groups, [
    { label: "סגנון", options: ["ריאליסטי", "קולנועי", "איור"] },
    { label: "מנוע", options: ["Google", "ElevenLabs"] },
  ]);
});

test("malformed groups are dropped, options are deduplicated and capped", () => {
  const { groups } = parseQuickReplies(
    "[[בחירה: בלי אפשרויות]] [[בחירה: | א | ב]] [[choice: x | 1 | 1 | 2 | 3 | 4 | 5 | 6 | 7]]",
  );
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].options, ["1", "2", "3", "4", "5", "6"]);
});

test("a message without markers is untouched", () => {
  const { text, groups } = parseQuickReplies("שלום [רגיל] וקישור [x](y)");
  assert.equal(text, "שלום [רגיל] וקישור [x](y)");
  assert.deepEqual(groups, []);
});

test("a half-written marker does not show while the reply streams", () => {
  assert.equal(hidePartialQuickReplies("שאלה\n[[בחירה: סגנון | ריא"), "שאלה");
  assert.equal(
    hidePartialQuickReplies("שאלה [[בחירה: א | ב]] עוד"),
    "שאלה  עוד",
  );
});

test("one group answers with the option, several answer with their labels", () => {
  const one = [{ label: "סגנון", options: ["א", "ב"] }];
  assert.equal(quickReplyAnswer(one, { סגנון: "ב" }), "ב");
  const two = [...one, { label: "מנוע", options: ["Google"] }];
  assert.equal(
    quickReplyAnswer(two, { סגנון: "א", מנוע: "Google" }),
    "סגנון: א\nמנוע: Google",
  );
  assert.equal(quickReplyAnswer(two, { מנוע: "Google" }), "מנוע: Google");
});

test("only the latest assistant reply is answerable, and a user message closes it", () => {
  assert.equal(answerableIndex([{ role: "user" }, { role: "assistant" }]), 1);
  assert.equal(
    answerableIndex([
      { role: "assistant" },
      { role: "tool_call" },
      { role: "tool_call" },
    ]),
    0,
  );
  assert.equal(answerableIndex([{ role: "assistant" }, { role: "user" }]), -1);
  assert.equal(answerableIndex([]), -1);
});
