import { expect, test } from "vitest";
import {
  filterEntityAssignmentOptions,
  toggleEntityAssignmentId,
} from "./entityAssignment.ts";

const options = [
  { id: "1", label: "ארבע על ארבע", description: "promo" },
  { id: "2", label: "BEVERTECH", description: "DMM" },
  { id: "3", label: "דוד כהן", description: "david@example.com" },
];

test("search matches Hebrew/English names and descriptions", () => {
  expect(
    filterEntityAssignmentOptions(options, "ארבע").map((item) => item.id),
  ).toStrictEqual(["1"]);
  expect(
    filterEntityAssignmentOptions(options, "bever").map((item) => item.id),
  ).toStrictEqual(["2"]);
  expect(
    filterEntityAssignmentOptions(options, "example.com").map(
      (item) => item.id,
    ),
  ).toStrictEqual(["3"]);
});

test("single assignment replaces the previous choice", () => {
  expect(toggleEntityAssignmentId(["1"], "2", false)).toStrictEqual(["2"]);
});

test("multiple assignment toggles members independently", () => {
  expect(toggleEntityAssignmentId(["1"], "2", true)).toStrictEqual(["1", "2"]);
  expect(toggleEntityAssignmentId(["1", "2"], "1", true)).toStrictEqual(["2"]);
});
