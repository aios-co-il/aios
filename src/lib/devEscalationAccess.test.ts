import { expect, test } from "vitest";
import {
  canDispatchDevTask,
  getDevEscalationTier,
} from "./devEscalationAccess.ts";

test("David user id gets full tier", () => {
  expect(
    getDevEscalationTier({ userId: "ac7b2493-dcfa-47d8-80cc-b3900a406c46" }),
  ).toBe("full");
  expect(canDispatchDevTask("full")).toBe(true);
});

test("unknown user cannot dispatch dev tasks", () => {
  expect(
    getDevEscalationTier({ userId: "00000000-0000-0000-0000-000000000000" }),
  ).toBe(null);
  expect(canDispatchDevTask(null)).toBe(false);
});
