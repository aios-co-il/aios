import { describe, expect, test } from "vitest";
import { answersFromMessage } from "@functions/_shared/workshop/brief-answers.ts";
import {
  MAX_FREE_ANSWER_CHARS,
  answerableIndex,
  freeAnswer,
  hidePartialQuickReplies,
  offersOther,
  parseQuickReplies,
  quickReplyAnswer,
} from "./quickReplies.ts";

test("markers become button groups and disappear from the text", () => {
  const { text, groups } = parseQuickReplies(
    "כמה שאלות:\n\n[[בחירה: סגנון | ריאליסטי | קולנועי | איור]]\n[[בחירה: מנוע | Google | ElevenLabs]]\n\nמה דעתך?",
  );
  expect(text).toBe("כמה שאלות:\n\nמה דעתך?");
  expect(groups).toStrictEqual([
    { label: "סגנון", options: ["ריאליסטי", "קולנועי", "איור"] },
    { label: "מנוע", options: ["Google", "ElevenLabs"] },
  ]);
});

test("malformed groups are dropped, options are deduplicated and capped", () => {
  const { groups } = parseQuickReplies(
    "[[בחירה: בלי אפשרויות]] [[בחירה: | א | ב]] [[choice: x | 1 | 1 | 2 | 3 | 4 | 5 | 6 | 7]]",
  );
  expect(groups.length).toBe(1);
  expect(groups[0].options).toStrictEqual(["1", "2", "3", "4", "5", "6"]);
});

test("a message without markers is untouched", () => {
  const { text, groups } = parseQuickReplies("שלום [רגיל] וקישור [x](y)");
  expect(text).toBe("שלום [רגיל] וקישור [x](y)");
  expect(groups).toStrictEqual([]);
});

test("a half-written marker does not show while the reply streams", () => {
  expect(hidePartialQuickReplies("שאלה\n[[בחירה: סגנון | ריא")).toBe("שאלה");
  expect(hidePartialQuickReplies("שאלה [[בחירה: א | ב]] עוד")).toBe(
    "שאלה  עוד",
  );
});

test("one group answers with the option, several answer with their labels", () => {
  const one = [{ label: "סגנון", options: ["א", "ב"] }];
  expect(quickReplyAnswer(one, { סגנון: "ב" })).toBe("ב");
  const two = [...one, { label: "מנוע", options: ["Google"] }];
  expect(quickReplyAnswer(two, { סגנון: "א", מנוע: "Google" })).toBe(
    "סגנון: א\nמנוע: Google",
  );
  expect(quickReplyAnswer(two, { מנוע: "Google" })).toBe("מנוע: Google");
});

test("only the latest assistant reply is answerable, and a user message closes it", () => {
  expect(answerableIndex([{ role: "user" }, { role: "assistant" }])).toBe(1);
  expect(
    answerableIndex([
      { role: "assistant" },
      { role: "tool_call" },
      { role: "tool_call" },
    ]),
  ).toBe(0);
  expect(answerableIndex([{ role: "assistant" }, { role: "user" }])).toBe(-1);
  expect(answerableIndex([])).toBe(-1);
});

describe("an answer in the user's own words", () => {
  test("every group offers it unless Carmen already wrote an other option", () => {
    expect(
      offersOther({ label: "קצב", options: ["מהיר", "אחרי הצהריים"] }),
    ).toBe(true);
    expect(offersOther({ label: "קצב", options: ["מהיר", "אחר"] })).toBe(false);
    expect(offersOther({ label: "קצב", options: ["אחר (פרטי)"] })).toBe(false);
    expect(offersOther({ label: "x", options: ["Other…"] })).toBe(false);
  });

  test("it does not take one of Carmen's six options", () => {
    const { groups } = parseQuickReplies(
      "[[בחירה: x | 1 | 2 | 3 | 4 | 5 | 6]]",
    );
    expect(groups[0].options.length).toBe(6);
    expect(offersOther(groups[0])).toBe(true);
  });

  test("it is one trimmed line, capped at the server's answer length", () => {
    expect(freeAnswer("  קצב\n  איטי  ")).toBe("קצב איטי");
    expect(freeAnswer("   ")).toBe("");
    expect(freeAnswer("א".repeat(300)).length).toBe(MAX_FREE_ANSWER_CHARS);
  });

  test("alone it still names its question, so the server saves it to the brief", () => {
    const groups = [{ label: "קצב", options: ["אנרגטי ומהיר", "רגוע ורגשי"] }];
    const message = quickReplyAnswer(groups, {
      קצב: freeAnswer("איטי ומהפנט"),
    });
    expect(message).toBe("קצב: איטי ומהפנט");
    expect(answersFromMessage(message, groups)).toStrictEqual({
      קצב: "איטי ומהפנט",
    });
  });

  test("among several groups it reaches the server as that question's answer", () => {
    const groups = [
      { label: "קצב", options: ["אנרגטי ומהיר", "רגוע ורגשי"] },
      { label: "סיום", options: ["קריאה לפעולה"] },
    ];
    const message = quickReplyAnswer(groups, {
      קצב: freeAnswer(" איטי בהתחלה ואז מתפוצץ "),
      סיום: "קריאה לפעולה",
    });
    expect(message).toBe("קצב: איטי בהתחלה ואז מתפוצץ\nסיום: קריאה לפעולה");
    expect(answersFromMessage(message, groups)).toStrictEqual({
      קצב: "איטי בהתחלה ואז מתפוצץ",
      סיום: "קריאה לפעולה",
    });
  });
});
