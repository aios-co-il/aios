import { expect, test } from "vitest";
import { runSlots } from "../src/loop.mjs";

test("drain exits once a slot sees an empty queue", async () => {
  let claims = 0;
  const started = Date.now();
  await runSlots({
    concurrency: 2,
    drain: true,
    sleep: async () => {
      throw new Error("drain must not sleep");
    },
    processOne: async () => {
      claims += 1;
      return claims <= 2;
    },
  });
  expect(claims >= 3).toBeTruthy();
  expect(Date.now() - started < 1000).toBeTruthy();
});

test("a running worker sleeps when the queue is empty until stopped", async () => {
  let slept = 0;
  let stop = false;
  await runSlots({
    concurrency: 1,
    drain: false,
    shouldStop: () => stop,
    sleep: async () => {
      slept += 1;
      stop = true;
    },
    processOne: async () => false,
  });
  expect(slept).toBe(1);
});

test("drain with an idle window keeps polling and picks up work queued meanwhile", async () => {
  let clock = 0;
  const answers = [false, false, true, false, false, false];
  let claims = 0;
  await runSlots({
    concurrency: 1,
    drain: true,
    idleMs: 3000,
    now: () => clock,
    sleep: async () => {
      clock += 1000;
    },
    processOne: async () => answers[claims++] ?? false,
  });
  expect(claims >= 6).toBeTruthy();
  expect(answers[2]).toBe(true);
});

test("no slot claims a new job at or after stopAt", async () => {
  let clock = 0;
  let claims = 0;
  await runSlots({
    concurrency: 1,
    drain: true,
    stopAt: 3000,
    now: () => clock,
    sleep: async () => {
      clock += 1000;
    },
    processOne: async () => {
      claims += 1;
      clock += 1000;
      return claims < 10;
    },
  });
  expect(claims).toBe(3);
});

test("near the runner's limit only short jobs are claimed", async () => {
  const { claimableKinds } = await import("../src/loop.mjs");
  const kinds = [
    "reference_analysis",
    "clip",
    "voice",
    "music",
    "lipsync",
    "render",
  ];
  expect(claimableKinds(kinds, 1000, 2000)).toStrictEqual(kinds);
  expect(claimableKinds(kinds, 2000, 2000)).toStrictEqual([
    "voice",
    "music",
    "render",
  ]);
  expect(claimableKinds(kinds, 5000)).toStrictEqual(kinds);
});
