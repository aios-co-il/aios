import { expect, test } from "vitest";
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
  expect(result).toStrictEqual({
    provider: "higgsfield",
    fallbackFrom: "elevenlabs",
  });
  expect(calls).toStrictEqual([
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
  expect(result.provider).toBe("mock");
  expect(result.fallbackFrom).toBe("elevenlabs");
  expect(calls.length).toBe(3);
});

test("after a provider accepted the job nothing switches engines", async () => {
  const late = afterSubmit("ElevenLabs 402 paid_plan_required while polling");
  const { calls, run } = recorder({ elevenlabs: late });
  await expect(
    runClipWithFallback({ name: "elevenlabs", keys, run }),
  ).rejects.toThrow(late);
  expect(calls).toStrictEqual([["elevenlabs", null]]);

  const higgsLate = afterSubmit("Higgsfield 401 while downloading");
  const second = recorder({ elevenlabs: paidPlan(), higgsfield: higgsLate });
  await expect(
    runClipWithFallback({ name: "elevenlabs", keys, run: second.run }),
  ).rejects.toThrow(higgsLate);
  expect(second.calls.some(([provider]) => provider === "mock")).toBe(false);
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
  expect(result).toStrictEqual({
    provider: "higgsfield",
    fallbackFrom: "elevenlabs",
  });
  expect(calls).toStrictEqual([["higgsfield", "elevenlabs"]]);
});

test("a full key in the secret field is enough to fall back to Higgsfield", async () => {
  const { calls, run } = recorder({ elevenlabs: paidPlan() });
  const result = await runClipWithFallback({
    name: "elevenlabs",
    keys: { higgsfieldKeyId: "", higgsfieldKeySecret: "id:secret" },
    run,
  });
  expect(result.provider).toBe("higgsfield");
  expect(calls[1]).toStrictEqual(["higgsfield", "elevenlabs"]);
});

test("a pinned engine that fails for another reason does not fall back", async () => {
  const error = new Error("Higgsfield 500 server error");
  const { calls, run } = recorder({ higgsfield: error });
  await expect(
    runClipWithFallback({ name: "higgsfield", keys, run }),
  ).rejects.toThrow(error);
  expect(calls.length).toBe(1);
});

test("an engine with no credits before submit moves the scene to the free preview", async () => {
  const { calls, run } = recorder({
    higgsfield: new Error(
      'higgsfield submit 403: {"detail":"not_enough_credits"}',
    ),
  });
  const result = await runClipWithFallback({ name: "higgsfield", keys, run });
  expect(result).toStrictEqual({
    provider: "mock",
    fallbackFrom: "higgsfield",
  });
  expect(calls).toStrictEqual([
    ["higgsfield", null],
    ["mock", "higgsfield"],
  ]);
});

test("no credits after the job was accepted never switches engines", async () => {
  const error = afterSubmit("higgsfield poll 402 not_enough_credits");
  const { calls, run } = recorder({ higgsfield: error });
  await expect(
    runClipWithFallback({ name: "higgsfield", keys, run }),
  ).rejects.toThrow(error);
  expect(calls.length).toBe(1);
});

const withOpenRouter = { ...keys, openRouterKey: "sk-or-1" };
const noCredits = () =>
  new Error('higgsfield submit 403: {"detail":"not_enough_credits"}');

test("a refused engine moves to OpenRouter before the free preview when the tenant has a key", async () => {
  const { calls, run } = recorder({ higgsfield: noCredits() });
  const result = await runClipWithFallback({
    name: "higgsfield",
    keys: withOpenRouter,
    run,
  });
  expect(result).toStrictEqual({
    provider: "openrouter",
    fallbackFrom: "higgsfield",
  });
  expect(calls).toStrictEqual([
    ["higgsfield", null],
    ["openrouter", "higgsfield"],
  ]);
});

test("OpenRouter refusing too ends on the free preview, still recording the chosen engine", async () => {
  const { calls, run } = recorder({
    kling: new Error("kling submit 402 insufficient balance"),
    openrouter: new Error("openrouter submit 402: insufficient credits"),
  });
  const result = await runClipWithFallback({
    name: "kling",
    keys: withOpenRouter,
    run,
  });
  expect(result).toStrictEqual({ provider: "mock", fallbackFrom: "kling" });
  expect(calls).toStrictEqual([
    ["kling", null],
    ["openrouter", "kling"],
    ["mock", "kling"],
  ]);
});

test("a chosen OpenRouter that refuses goes straight to the free preview", async () => {
  const { calls, run } = recorder({
    openrouter: new Error("openrouter submit 401: invalid key"),
  });
  const result = await runClipWithFallback({
    name: "openrouter",
    keys: withOpenRouter,
    run,
  });
  expect(result).toStrictEqual({
    provider: "mock",
    fallbackFrom: "openrouter",
  });
  expect(calls).toStrictEqual([
    ["openrouter", null],
    ["mock", "openrouter"],
  ]);
});

test("the OpenRouter key is looked up only when the fallback needs it", async () => {
  let lookups = 0;
  const resolveOpenRouterKey = async () => {
    lookups += 1;
    return "sk-or-vault";
  };
  const ok = recorder({});
  await runClipWithFallback({
    name: "higgsfield",
    keys,
    resolveOpenRouterKey,
    run: ok.run,
  });
  expect(lookups).toBe(0);

  const refused = recorder({ higgsfield: noCredits() });
  const result = await runClipWithFallback({
    name: "higgsfield",
    keys,
    resolveOpenRouterKey,
    run: refused.run,
  });
  expect(lookups).toBe(1);
  expect(result.provider).toBe("openrouter");

  const broken = recorder({ higgsfield: noCredits() });
  const fallback = await runClipWithFallback({
    name: "higgsfield",
    keys,
    resolveOpenRouterKey: async () => {
      throw new Error("vault down");
    },
    run: broken.run,
  });
  expect(fallback.provider).toBe("mock");
});

test("without an OpenRouter key a refused engine skips it", async () => {
  const { calls, run } = recorder({ higgsfield: noCredits() });
  await runClipWithFallback({ name: "higgsfield", keys, run });
  expect(calls.some(([provider]) => provider === "openrouter")).toBe(false);
});

test("an OpenRouter job that was accepted and then failed never falls to the free preview", async () => {
  const late = afterSubmit("openrouter poll 402 insufficient credits");
  const { calls, run } = recorder({
    higgsfield: noCredits(),
    openrouter: late,
  });
  await expect(
    runClipWithFallback({ name: "higgsfield", keys: withOpenRouter, run }),
  ).rejects.toThrow(late);
  expect(calls.some(([provider]) => provider === "mock")).toBe(false);
});

test("an ElevenLabs plan refusal tries Higgsfield, then OpenRouter, then the free preview", async () => {
  const { calls, run } = recorder({
    elevenlabs: paidPlan(),
    higgsfield: noCredits(),
  });
  const result = await runClipWithFallback({
    name: "elevenlabs",
    keys: withOpenRouter,
    run,
  });
  expect(result).toStrictEqual({
    provider: "openrouter",
    fallbackFrom: "elevenlabs",
  });
  expect(calls).toStrictEqual([
    ["elevenlabs", null],
    ["higgsfield", "elevenlabs"],
    ["openrouter", "elevenlabs"],
  ]);
});

test("a retry resumes a saved OpenRouter fallback job instead of submitting again", async () => {
  const { calls, run } = recorder({});
  await runClipWithFallback({
    name: "higgsfield",
    keys: withOpenRouter,
    savedProvider: "openrouter",
    savedJobId: "or-job-1",
    run,
  });
  expect(calls).toStrictEqual([["openrouter", "higgsfield"]]);
});

test("an ElevenLabs key refused at submit moves to OpenRouter, not Higgsfield", async () => {
  const { calls, run } = recorder({
    elevenlabs: new Error(
      'elevenlabs submit 401: {"detail":{"status":"missing_permissions"}}',
    ),
  });
  const result = await runClipWithFallback({
    name: "elevenlabs",
    keys: withOpenRouter,
    run,
  });
  expect(result).toStrictEqual({
    provider: "openrouter",
    fallbackFrom: "elevenlabs",
  });
  expect(calls).toStrictEqual([
    ["elevenlabs", null],
    ["openrouter", "elevenlabs"],
  ]);

  const broken = new Error("elevenlabs submit 500: server error");
  const other = recorder({ elevenlabs: broken });
  await expect(
    runClipWithFallback({
      name: "elevenlabs",
      keys: withOpenRouter,
      run: other.run,
    }),
  ).rejects.toThrow(broken);
  expect(other.calls.length).toBe(1);
});

test("a replacement that costs more than the approved engine is skipped", async () => {
  const { calls, run } = recorder({ elevenlabs: paidPlan() });
  const result = await runClipWithFallback({
    name: "elevenlabs",
    keys,
    run,
    affordable: (provider) => provider !== "higgsfield",
  });
  expect(result.provider).toBe("mock");
  expect(calls).toStrictEqual([
    ["elevenlabs", null],
    ["mock", "elevenlabs"],
  ]);
});
