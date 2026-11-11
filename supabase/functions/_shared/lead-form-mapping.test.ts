import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { nonEmptyStringOrNull, salesPersonIdsOf } from "./lead-form-mapping.ts";

Deno.test("nonEmptyStringOrNull keeps non-empty strings only", () => {
  assertStrictEquals(nonEmptyStringOrNull("agency-1"), "agency-1");
  for (const value of ["", null, undefined, 42, {}, ["a"]]) {
    assertStrictEquals(nonEmptyStringOrNull(value), null);
  }
});

const cases: Array<[string, Record<string, unknown>, string[]]> = [
  ["a sales_person_ids list", { sales_person_ids: ["s1", "s2"] }, ["s1", "s2"]],
  ["the legacy single id", { sales_person_id: "s1" }, ["s1"]],
  [
    "the list over the legacy id",
    { sales_person_ids: ["s2"], sales_person_id: "s1" },
    ["s2"],
  ],
  [
    "the legacy id when the list is empty-string",
    { sales_person_ids: "", sales_person_id: "s1" },
    ["s1"],
  ],
  ["non-string entries dropped", { sales_person_ids: ["s1", 7, null] }, ["s1"]],
  ["nothing configured", {}, []],
  ["a numeric legacy id", { sales_person_id: 5 }, []],
];

for (const [name, mapping, expected] of cases) {
  Deno.test(`salesPersonIdsOf: ${name}`, () => {
    assertEquals(salesPersonIdsOf(mapping), expected);
  });
}
