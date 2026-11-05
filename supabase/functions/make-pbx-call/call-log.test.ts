import { assertEquals } from "jsr:@std/assert@1";
import { newCallRow } from "./call-log.ts";

Deno.test("newCallRow", async (t) => {
  await t.step("a call started from AIOS is the clicker's", () => {
    const row = newCallRow({
      tenantId: "t1",
      userId: "dana",
      leadId: null,
      clientId: "c1",
      toNumber: "0502222222",
      callerNumber: "031111111",
      extension: "205",
      callId: "call-1",
    });
    assertEquals(
      [row.caller_user_id, row.caller_resolution, row.provider, row.notes],
      ["dana", "click_to_call", "pbx", "שלוחה 205"],
    );
  });
});
