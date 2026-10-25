import assert from "node:assert/strict";
import test from "node:test";
import { runClipWithFallback } from "../src/clip-fallback.mjs";

const keys = { higgsfieldKeyId: "id", higgsfieldKeySecret: "secret" };
const paidPlan = () => new Error("ElevenLabs 402 paid_plan_required");
const afterSubmit = (message) =>
  Object.assign(new Error(message), { submitted: true });

function recorder(answers) {
  const calls = [];
  return {
    calls,
    run: async (provider, fallbackFrom) => {
      calls.push([provider, fallbackFrom]);
      const answer = answers[provider];
      if (answer instanceof Error) throw answer;
      return { provider, fallbackFrom };
    },
  };
}

test("a plan refusal before submit moves to Higgsfield and records what it replaced", async () => {
  const { calls, run } = recorder({ elevenlabs: paidPlan() });
  const result = await runClipWithFallback({ name: "elevenlabs", keys, run });
  assert.deepEqual(result, {
    provider: "higgsfield",
    fallbackFrom: "elevenlabs",
  });
  assert.deepEqual(calls, [
    ["elevenlabs", null],
    ["higgsfield", "elevenlabs"],
  ]);
});

test("a rejected Higgsfield key before submit ends on the free preview", async () => {
  const { calls, run } = recorder({
    elevenlabs: paidPlan(),
    higgsfield: new Error("Higgsfield 401 Invalid credentials"),
  });
  const result = await runClipWithFallback({ name: "elevenlabs", keys, run });
  assert.equal(result.provider, "mock");
  assert.equal(result.fallbackFrom, "elevenlabs");
  assert.equal(calls.length, 3);
});

test("after a provider accepted the job nothing switches engines", async () => {
  const late = afterSubmit("ElevenLabs 402 paid_plan_required while polling");
  const { calls, run } = recorder({ elevenlabs: late });
  await assert.rejects(
    runClipWithFallback({ name: "elevenlabs", keys, run }),
    late,
  );
  assert.deepEqual(calls, [["elevenlabs", null]]);

  const higgsLate = afterSubmit("Higgsfield 401 while downloading");
  const second = recorder({ elevenlabs: paidPlan(), higgsfield: higgsLate });
  await assert.rejects(
    runClipWithFallback({ name: "elevenlabs", keys, run: second.run }),
    higgsLate,
  );
  assert.equal(
    second.calls.some(([provider]) => provider === "mock"),
    false,
  );
});

test("a retry resumes the job a fallback already saved instead of submitting again", async () => {
  const { calls, run } = recorder({});
  const result = await runClipWithFallback({
    name: "elevenlabs",
    keys,
    savedProvider: "higgsfield",
    savedJobId: "job-1",
    run,
  });
  assert.deepEqual(result, {
    provider: "higgsfield",
    fallbackFrom: "elevenlabs",
  });
  assert.deepEqual(calls, [["higgsfield", "elevenlabs"]]);
});

test("a pinned engine other than ElevenLabs never falls back", async () => {
  const error = new Error("Higgsfield 402");
  const { calls, run } = recorder({ higgsfield: error });
  await assert.rejects(
    runClipWithFallback({ name: "higgsfield", keys, run }),
    error,
  );
  assert.equal(calls.length, 1);
});
