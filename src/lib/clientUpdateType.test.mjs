import { expect, test } from "vitest";

import {
  describesCompletedClientPhoneCall,
  isClientCallUpdate,
  resolveClientUpdateType,
} from "./clientUpdateType.ts";

test("recognizes affirmative client phone-call notes", () => {
  for (const content of [
    "דיברתי עם הלקוח ועדכנתי אותו בתוצאות",
    "דיברנו טלפונית עם הלקוחה על הקמפיין",
    "שוחחתי בטלפון עם הלקוח",
    "בוצעה שיחה עם הלקוח, הכל תקין",
    "שיחת טלפון עם הלקוחה בנושא הלידים",
  ]) {
    expect(describesCompletedClientPhoneCall(content), content).toBe(true);
  }
});

test("rejects attempted, missing, and non-call contact", () => {
  for (const content of [
    "לא דיברתי עם הלקוח השבוע",
    "טרם הצלחתי לדבר עם הלקוחה",
    "אין מענה מהלקוח",
    "הלקוח לא ענה",
    "שלחתי ללקוח עדכון בוואטסאפ",
    "עדכון שבועי על ביצועי הקמפיין",
  ]) {
    expect(describesCompletedClientPhoneCall(content), content).toBe(false);
  }
});

test("promotes only qualifying weekly updates to call", () => {
  expect(
    resolveClientUpdateType("weekly_update", "דיברתי עם הלקוח על מצב הקמפיין"),
  ).toBe("call");
  expect(resolveClientUpdateType("weekly_update", "שלחתי סיכום במייל")).toBe(
    "weekly_update",
  );
  expect(resolveClientUpdateType("meeting", "דיברתי עם הלקוח")).toBe("meeting");
});

test("isClientCallUpdate matches call rows and qualifying weekly notes", () => {
  expect(isClientCallUpdate("call", "כל תוכן")).toBe(true);
  expect(
    isClientCallUpdate("weekly_update", "דיברתי עם הלקוח על מצב הקמפיין"),
  ).toBe(true);
  expect(isClientCallUpdate("weekly_update", "שלחתי סיכום במייל")).toBe(false);
  expect(isClientCallUpdate("email", "דיברתי עם הלקוח")).toBe(false);
});
