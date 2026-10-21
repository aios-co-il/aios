import assert from "node:assert/strict";
import test from "node:test";
import { leadPhoneCandidates, parsePbxEvent } from "./event.ts";
import { secretsMatch } from "./secret.ts";
import { mapCallStatus } from "./status.ts";

test("parsePbxEvent reads common field aliases", () => {
  const event = parsePbxEvent({
    from: "972501234567",
    to: "031111111",
    ext: "205",
    direction: "incoming",
    billsec: "65",
    recording: "https://pbx.example.com/r.mp3",
    uniqueid: "abc",
  });
  assert.equal(event.caller, "972501234567");
  assert.equal(event.called, "031111111");
  assert.equal(event.extension, "205");
  assert.equal(event.direction, "inbound");
  assert.equal(event.duration, 65);
  assert.equal(event.recordingUrl, "https://pbx.example.com/r.mp3");
  assert.equal(event.callId, "abc");
});

test("leadPhoneCandidates follows the call direction", () => {
  const base = parsePbxEvent({ caller: "0501234567", called: "031111111" });
  assert.deepEqual(leadPhoneCandidates(base), ["501234567", "031111111"]);
  const outbound = parsePbxEvent({
    caller: "0501234567",
    called: "0529876543",
    direction: "outbound",
  });
  assert.deepEqual(leadPhoneCandidates(outbound), ["529876543", "501234567"]);
  const explicit = parsePbxEvent({
    caller: "031111111",
    lead_phone: "+972 52 987 6543",
  });
  assert.deepEqual(leadPhoneCandidates(explicit), ["529876543"]);
});

test("mapCallStatus maps PBX statuses onto call_logs values", () => {
  assert.equal(mapCallStatus("ANSWERED"), "completed");
  assert.equal(mapCallStatus("NO ANSWER"), "no-answer");
  assert.equal(mapCallStatus("busy"), "busy");
  assert.equal(mapCallStatus("FAILED"), "failed");
  assert.equal(mapCallStatus("in_progress"), "in-progress");
  assert.equal(mapCallStatus(null), "completed");
});

test("secretsMatch compares exactly", () => {
  assert.equal(secretsMatch("abc123", "abc123"), true);
  assert.equal(secretsMatch("abc123", "abc124"), false);
  assert.equal(secretsMatch("abc123", "abc"), false);
  assert.equal(secretsMatch("", ""), false);
});
