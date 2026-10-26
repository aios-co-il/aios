import { expect, test } from "vitest";
import { coerceHumanTaskStatus, mapHumanTaskStatus } from "./taskStatus.ts";

test("maps completed to the DB enum value done", () => {
  expect(mapHumanTaskStatus("completed")).toBe("done");
  expect(mapHumanTaskStatus("COMPLETED")).toBe("done");
  expect(mapHumanTaskStatus("done")).toBe("done");
});

test("passes through open and in_progress", () => {
  expect(mapHumanTaskStatus("open")).toBe("open");
  expect(mapHumanTaskStatus("in_progress")).toBe("in_progress");
});

test("rejects cancelled and unknown values", () => {
  expect(() => mapHumanTaskStatus("cancelled")).toThrow(/לא תקין/);
  expect(() => mapHumanTaskStatus("")).toThrow(/לא תקין/);
});

test("coerceHumanTaskStatus never throws and defaults unknown to open", () => {
  expect(coerceHumanTaskStatus("completed")).toBe("done");
  expect(coerceHumanTaskStatus("in_progress")).toBe("in_progress");
  expect(coerceHumanTaskStatus("cancelled")).toBe("open");
  expect(coerceHumanTaskStatus("")).toBe("open");
  expect(coerceHumanTaskStatus(null)).toBe("open");
});
