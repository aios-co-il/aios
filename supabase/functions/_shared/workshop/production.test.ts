import assert from "node:assert/strict";
import { test } from "node:test";
import { productionReport } from "./production.ts";

const now = Date.parse("2026-10-24T20:00:00Z");
const ago = (min: number) => new Date(now - min * 60_000).toISOString();

test("jobs nobody claims for minutes are reported as a missing render worker", () => {
  const report = productionReport(
    [
      { kind: "clip", status: "queued", created_at: ago(7) },
      { kind: "clip", status: "queued", created_at: ago(6) },
    ],
    { status: "running" },
    now,
  );
  assert.equal(report.stalled, true);
  assert.equal(report.queued, 2);
  assert.equal(report.oldest_queued_min, 7);
  assert.match(report.summary, /render worker/);
});

test("fresh queued jobs or any running job are not a stall", () => {
  assert.equal(
    productionReport(
      [{ kind: "clip", status: "queued", created_at: ago(1) }],
      { status: "running" },
      now,
    ).stalled,
    false,
  );
  const busy = productionReport(
    [
      { kind: "clip", status: "queued", created_at: ago(9) },
      { kind: "clip", status: "running", created_at: ago(9) },
    ],
    { status: "running" },
    now,
  );
  assert.equal(busy.stalled, false);
  assert.match(busy.summary, /1 בעבודה/);
});

test("a failed production says why, and a finished one says it is on the board", () => {
  const failed = productionReport(
    [{ kind: "clip", status: "failed", error: "quota exceeded" }],
    { status: "failed", error: "narration missing" },
    now,
  );
  assert.match(failed.summary, /narration missing/);
  assert.deepEqual(failed.errors, ["quota exceeded"]);
  assert.match(productionReport([], { status: "done" }, now).summary, /בלוח/);
  assert.match(productionReport([], null, now).summary, /אין הפקה/);
});
