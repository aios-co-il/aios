import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { leadPhoneCandidates, parsePbxEvent } from "./event.ts";
import { mapCallStatus } from "./status.ts";

Deno.test("parsePbxEvent reads common field aliases", () => {
  const event = parsePbxEvent({
    from: "972501234567",
    to: "031111111",
    ext: "205",
    direction: "incoming",
    billsec: "65",
    recording: "https://pbx.example.com/r.mp3",
    uniqueid: "abc",
  });
  assertStrictEquals(event.caller, "972501234567");
  assertStrictEquals(event.called, "031111111");
  assertStrictEquals(event.extension, "205");
  assertStrictEquals(event.direction, "inbound");
  assertStrictEquals(event.duration, 65);
  assertStrictEquals(event.recordingUrl, "https://pbx.example.com/r.mp3");
  assertStrictEquals(event.callId, "abc");
});

Deno.test("leadPhoneCandidates follows the call direction", () => {
  const base = parsePbxEvent({ caller: "0501234567", called: "031111111" });
  assertEquals(leadPhoneCandidates(base), ["501234567", "031111111"]);
  const outbound = parsePbxEvent({
    caller: "0501234567",
    called: "0529876543",
    direction: "outbound",
  });
  assertEquals(leadPhoneCandidates(outbound), ["529876543", "501234567"]);
  const explicit = parsePbxEvent({
    caller: "031111111",
    lead_phone: "+972 52 987 6543",
  });
  assertEquals(leadPhoneCandidates(explicit), ["529876543"]);
});

Deno.test("mapCallStatus maps PBX statuses onto call_logs values", () => {
  assertStrictEquals(mapCallStatus("ANSWERED"), "completed");
  assertStrictEquals(mapCallStatus("NO ANSWER"), "no-answer");
  assertStrictEquals(mapCallStatus("busy"), "busy");
  assertStrictEquals(mapCallStatus("FAILED"), "failed");
  assertStrictEquals(mapCallStatus("in_progress"), "in-progress");
  assertStrictEquals(mapCallStatus(null), "completed");
});
