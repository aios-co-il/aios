import { expect, test } from "vitest";
import {
  digitsOnly,
  leadMatchesPhoneSearch,
  leadSearchOrFilter,
  phoneSearchNeedle,
} from "./leadPhone.ts";

test("phoneSearchNeedle uses last 9 digits so 050 and 972 match", () => {
  expect(phoneSearchNeedle("0507677613")).toBe("507677613");
  expect(phoneSearchNeedle("972507677613")).toBe("507677613");
  expect(phoneSearchNeedle("+972-50-767-7613")).toBe("507677613");
  expect(phoneSearchNeedle("דוד")).toBe(null);
});

test("leadMatchesPhoneSearch finds 972 storage from a local 050 query", () => {
  expect(leadMatchesPhoneSearch("972507677613", "0507677613")).toBe(true);
  expect(leadMatchesPhoneSearch("0507677613", "972507677613")).toBe(true);
  expect(leadMatchesPhoneSearch("0501111111", "0507677613")).toBe(false);
});

test("leadSearchOrFilter searches last-9 digits on phone", () => {
  const clause = leadSearchOrFilter("0507677613");
  expect(clause).toMatch(/phone\.ilike\.%507677613%/);
  expect(clause).toMatch(/contact_name\.ilike\.%0507677613%/);
});

test("digitsOnly strips formatting", () => {
  expect(digitsOnly("+972-50-767-7613")).toBe("972507677613");
});
