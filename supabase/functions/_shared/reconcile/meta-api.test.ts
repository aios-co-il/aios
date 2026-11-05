import {
  assert,
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { CallBudget } from "./budget.ts";
import { ReconcileSourceError } from "./errors.ts";
import { classifyMetaError } from "./meta-api.ts";
import {
  metaRecording,
  recordedMetaTable as metaTable,
  TOKEN,
} from "./meta-recordings.ts";
import { createMetaSource } from "./meta-source.ts";
import { replay, sleepRecorder } from "./test-fixtures.ts";

describe("metaGetJson", () => {
  it("backs off and retries a rate limit", async () => {
    const { sleep, sleeps } = sleepRecorder();
    const rec = metaRecording([
      {
        match: /\/act_1234\?/,
        status: 400,
        body: { error: { code: 17, message: "User request limit reached" } },
      },
    ]);
    const budget = new CallBudget(50);
    const source = createMetaSource({
      getToken: () => Promise.resolve(TOKEN),
      budget,
      fetch: rec.fetchFn,
      sleep,
    });
    const account = await source.account(metaTable);
    assertStrictEquals(account.timezone, "Asia/Jerusalem");
    assertEquals(sleeps, [2000]);
    assertStrictEquals(budget.used, 2);
  });

  it("turns a persistent rate limit into a rate_limit error", async () => {
    const { sleep, sleeps } = sleepRecorder();
    const limited = {
      match: /\/act_1234\?/,
      status: 400,
      body: {
        error: { code: 80004, message: "There have been too many calls" },
      },
    };
    const rec = replay([limited, limited, limited]);
    const source = createMetaSource({
      getToken: () => Promise.resolve(TOKEN),
      budget: new CallBudget(50),
      fetch: rec.fetchFn,
      sleep,
    });
    const err = await assertRejects(
      () => source.account(metaTable),
      ReconcileSourceError,
    );
    assertStrictEquals(err.kind, "rate_limit");
    // 80004 throttles one ad account, not the app: only this table stops.
    assertStrictEquals(err.scope, "account");
    assertEquals(sleeps, [2000, 4000]);
  });

  it("stops the platform on an app-level rate limit; every request has a timeout", async () => {
    const limited = {
      match: /\/act_1234\?/,
      status: 400,
      body: {
        error: { code: 4, message: "Application request limit reached" },
      },
    };
    const rec = replay([limited, limited, limited]);
    const source = createMetaSource({
      getToken: () => Promise.resolve(TOKEN),
      budget: new CallBudget(50),
      fetch: rec.fetchFn,
      sleep: sleepRecorder().sleep,
    });
    const err = await assertRejects(
      () => source.account(metaTable),
      ReconcileSourceError,
    );
    assertStrictEquals(err.scope, "platform");
    assert(rec.calls.every((c) => c.init?.signal instanceof AbortSignal));
  });

  it("stops before the next request once the budget is exhausted", async () => {
    const rec = metaRecording();
    const source = createMetaSource({
      getToken: () => Promise.resolve(TOKEN),
      budget: new CallBudget(3),
      fetch: rec.fetchFn,
      sleep: sleepRecorder().sleep,
    });
    const account = await source.account(metaTable);
    const err = await assertRejects(
      () =>
        source.campaignDays(
          metaTable,
          { start: "2026-10-19", end: "2026-10-25" },
          account,
        ),
      ReconcileSourceError,
    );
    assertStrictEquals(err.kind, "budget");
  });
});

describe("classifyMetaError", () => {
  it("tells auth, rate-limit and platform errors apart", () => {
    assertStrictEquals(classifyMetaError(400, { code: 190 }), "auth");
    assertStrictEquals(classifyMetaError(400, { code: 4 }), "rate_limit");
    assertStrictEquals(classifyMetaError(429, null), "rate_limit");
    assertStrictEquals(classifyMetaError(403, { code: 200 }), "auth");
    assertStrictEquals(classifyMetaError(500, { code: 1 }), "platform");
  });
});
