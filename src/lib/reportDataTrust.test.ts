import { expect, test } from "vitest";
import {
  isReconciledIntegration,
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
    "בבדיקה מול גוגל אדס לימים 19.10–25.10 נמצאו 4 פערים",
  );
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

test("only ad report tables are reconciled", () => {
  expect(isReconciledIntegration("facebook_ecommerce")).toBe(true);
  expect(isReconciledIntegration("google_ads")).toBe(true);
  expect(isReconciledIntegration("google_analytics")).toBe(false);
  expect(isReconciledIntegration(null)).toBe(false);
});
