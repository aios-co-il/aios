import { assertStrictEquals, assertThrows } from "jsr:@std/assert@1";
import { requireInsertValue } from "./database-contracts.ts";
import { crmRecordDay } from "./tool-contracts-crm.ts";

Deno.test("crmRecordDay keeps string dates and drops non-string ones", () => {
  assertStrictEquals(
    crmRecordDay({ date: "2026-10-01", spend: 3 }),
    "2026-10-01",
  );
  for (const data of [
    { date: "" },
    { date: 20261001 },
    { date: null },
    { spend: 3 },
    ["2026-10-01"],
    "2026-10-01",
    null,
  ]) {
    assertStrictEquals(crmRecordDay(data), null);
  }
});

Deno.test(
  "NOT NULL insert values fail before the request only when missing",
  () => {
    assertStrictEquals(requireInsertValue("", "t.c"), "");
    assertThrows(
      () => requireInsertValue(null, "t.user_id"),
      Error,
      "t.user_id",
    );
  },
);
