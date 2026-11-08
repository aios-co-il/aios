import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { readLegacyMessageRow, readLegacyTaskRow } from "./legacy-rows.ts";
Deno.test(
  "memory rows reject malformed identities before constructing pointers",
  () => {
    for (const value of [null, 3, { id: 3 }, {}])
      assertThrows(() => readLegacyTaskRow(value));
  },
);
Deno.test("task payload validates fields independently", () => {
  const task = readLegacyTaskRow({
    id: "t",
    title: { bad: true },
    status: "open",
    assigned_to_campaigner_id: "u",
  });
  assertEquals(task.title, undefined);
  assertEquals(task.status, "open");
  assertEquals(task.assigned_to_campaigner_id, "u");
});
Deno.test("message payload keeps supported legacy text fields", () => {
  const message = readLegacyMessageRow({
    id: "m",
    body: "hello",
    provider: "whatsapp",
    lead_id: null,
  });
  assertEquals(message.body, "hello");
  assertEquals(message.lead_id, null);
});
