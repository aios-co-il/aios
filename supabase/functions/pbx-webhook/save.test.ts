import { assertEquals } from "jsr:@std/assert@1";
import type { PbxEvent } from "../_shared/telephony/types.ts";
import type { CallLogRow } from "./match.ts";
import { callUpdate } from "./save.ts";

const settings = { extensions: [{ extension: "101", user_id: "dana" }] };
const NO_RECORDING = { url: null, path: null };
const NO_OWNER = { leadId: null, clientId: null };

function row(fields: Partial<CallLogRow> = {}): CallLogRow {
  return {
    id: "call-1",
    lead_id: null,
    client_id: "c1",
    status: "ringing",
    recording_url: null,
    recording_path: null,
    caller_resolution: "fallback",
    ...fields,
  };
}

function event(fields: Partial<PbxEvent> = {}): PbxEvent {
  return {
    callId: "pbx-1",
    caller: "0501111111",
    called: "0502222222",
    extension: "101",
    direction: "outbound",
    leadPhone: null,
    status: "completed",
    duration: 300,
    recordingUrl: null,
    ...fields,
  };
}

Deno.test("callUpdate", async (t) => {
  await t.step(
    "a later event with a mapped extension names the caller of a fallback call",
    () => {
      const update = callUpdate(
        row(),
        event(),
        NO_OWNER,
        NO_RECORDING,
        settings,
      );
      assertEquals(
        [update.caller_user_id, update.caller_resolution, update.duration],
        ["dana", "extension", 300],
      );
    },
  );

  await t.step("a click-to-call keeps the person who started it", () => {
    const update = callUpdate(
      row({ caller_resolution: "click_to_call" }),
      event(),
      NO_OWNER,
      NO_RECORDING,
      settings,
    );
    assertEquals("caller_user_id" in update, false);
    assertEquals(update.status, "completed");
  });
});
