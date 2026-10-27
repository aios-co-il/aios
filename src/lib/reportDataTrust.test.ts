import { expect, test } from "vitest";
import {
  isReconciledIntegration,
  pickTrustRun,
  reportDataTrust,
  type ReconcileRunSnapshot,
} from "./reportDataTrust.ts";

const now = new Date("2026-10-26T09:00:00Z");
const run = (overrides: Partial<ReconcileRunSnapshot> = {}) => ({
  status: "ok",
  started_at: "2026-10-26T01:30:00Z",
  finished_at: "2026-10-26T01:30:04Z",
  window_start: "2026-10-19",
  window_end: "2026-10-25",
  platform: "meta",
  summary: {},
  ...overrides,
});

test("a matching run shows the matched line", () => {
  expect(reportDataTrust(run(), now)).toEqual({
    tone: "ok",
    label: "תואם לפלטפורמה ✓",
    title: "הנתונים נבדקו מול מטא לימים 19.10–25.10 ותואמים",
  });
});

test("a run with gaps says so, with the count in the tooltip", () => {
  const trust = reportDataTrust(
    run({
      status: "mismatch",
      platform: "google",
      summary: { findings_total: 4 },
    }),
    now,
  );
  expect(trust?.tone).toBe("gaps");
  expect(trust?.label).toBe("נמצאו פערים מול הפלטפורמה");
  expect(trust?.title).toBe(
    "בבדיקה מול Google Ads לימים 19.10–25.10 נמצאו 4 פערים",
  );
});

test("a single gap reads in the singular", () => {
  const trust = reportDataTrust(
    run({ status: "mismatch", summary: { findings_total: 1 } }),
    now,
  );
  expect(trust?.title).toBe("בבדיקה מול מטא לימים 19.10–25.10 נמצא פער אחד");
});

test("nothing is shown without a recent, completed comparison", () => {
  expect(reportDataTrust(null, now)).toBeNull();
  expect(reportDataTrust(run({ status: "failed" }), now)).toBeNull();
  expect(reportDataTrust(run({ status: "skipped" }), now)).toBeNull();
  expect(
    reportDataTrust(
      run({
        started_at: "2026-10-22T01:30:00Z",
        finished_at: "2026-10-22T01:31:00Z",
      }),
      now,
    ),
  ).toBeNull();
});

test("a run a rate limit stopped never hides the result before it", () => {
  const passedOver = run({
    status: "skipped",
    started_at: "2026-10-26T02:00:00Z",
    finished_at: "2026-10-26T02:00:00Z",
    summary: { skipped_reason: "platform_rate_limited" },
  });
  const refused = run({
    status: "failed",
    started_at: "2026-10-26T01:50:00Z",
    finished_at: "2026-10-26T01:50:00Z",
    summary: { error_kind: "rate_limit" },
  });
  const previous = run({ started_at: "2026-10-25T01:30:00Z" });
  expect(pickTrustRun([passedOver, refused, previous])).toBe(previous);
  // Any other failure or skip is the latest word: the line stays hidden.
  const authFailed = run({ status: "failed", summary: { error_kind: "auth" } });
  expect(pickTrustRun([authFailed, previous])).toBe(authFailed);
  expect(reportDataTrust(pickTrustRun([authFailed, previous]), now)).toBeNull();
  expect(pickTrustRun([passedOver])).toBeNull();
  expect(pickTrustRun(null)).toBeNull();
});

test("only ad report tables are reconciled", () => {
  expect(isReconciledIntegration("facebook_ecommerce")).toBe(true);
  expect(isReconciledIntegration("google_ads")).toBe(true);
  expect(isReconciledIntegration("google_analytics")).toBe(false);
  expect(isReconciledIntegration(null)).toBe(false);
});
