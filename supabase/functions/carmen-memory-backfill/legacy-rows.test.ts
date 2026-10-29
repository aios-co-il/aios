import { assertEquals } from "jsr:@std/assert@1";
import { readLegacyMessageRow, readLegacyTaskRow } from "./legacy-rows.ts";

Deno.test("readLegacyTaskRow keeps task fields of any type", () => {
  const row = { id: "t1", title: 5, description: null, status: "open" };
  assertEquals(readLegacyTaskRow(row), row);
});

Deno.test("readLegacyMessageRow keeps message fields of any type", () => {
  const row = { id: 7, body: "hi", provider: "whatsapp", lead_id: null };
  assertEquals(readLegacyMessageRow(row), row);
});

Deno.test("legacy row readers map non-object rows to an empty row", () => {
  for (const raw of [null, undefined, "s", 3, [1]]) {
    assertEquals(readLegacyTaskRow(raw), {});
    assertEquals(readLegacyMessageRow(raw), {});
  }
});
