import { expect, test } from "vitest";
import {
  pickTranscriptRow,
  resolveSummaryTarget,
} from "./recordingSummaryTarget.ts";

test("an explicit summary scope wins over other associations", () => {
  expect(
    resolveSummaryTarget({
      id: "rec-1",
      summary_scope: "campaigner",
      client_id: "client-1",
      campaigner_ids: ["camp-1"],
      agency_id: "agency-1",
    }),
  ).toStrictEqual({ target_type: "campaigner", target_id: "camp-1" });

  expect(
    resolveSummaryTarget({
      id: "rec-2",
      summary_scope: "agency",
      agency_id: "agency-1",
      client_id: "client-1",
    }),
  ).toStrictEqual({ target_type: "agency", target_id: "agency-1" });
});

test("without a scope the client, lead, campaigner, agency order is preserved", () => {
  expect(
    resolveSummaryTarget({
      id: "rec-3",
      client_id: "client-1",
      agency_id: "agency-1",
    }),
  ).toStrictEqual({ target_type: "client", target_id: "client-1" });
  expect(
    resolveSummaryTarget({
      id: "rec-4",
      lead_id: "lead-1",
      agency_id: "agency-1",
    }),
  ).toStrictEqual({ target_type: "lead", target_id: "lead-1" });
  expect(
    resolveSummaryTarget({
      id: "rec-5",
      campaigner_ids: ["camp-1"],
      agency_id: "agency-1",
    }),
  ).toStrictEqual({ target_type: "campaigner", target_id: "camp-1" });
  expect(
    resolveSummaryTarget({ id: "rec-6", agency_id: "agency-1" }),
  ).toStrictEqual({ target_type: "agency", target_id: "agency-1" });
});

test("an unassigned recording falls back to the tenant agency, otherwise null", () => {
  expect(
    resolveSummaryTarget({ id: "rec-7", campaigner_ids: [] }, "agency-default"),
  ).toStrictEqual({ target_type: "agency", target_id: "agency-default" });
  expect(resolveSummaryTarget({ id: "rec-8" })).toBe(null);
  expect(
    resolveSummaryTarget({ id: "rec-9", summary_scope: "client" }, null),
  ).toBe(null);
});

test("a stale scope never overrides the association that actually exists", () => {
  expect(
    resolveSummaryTarget({
      id: "rec-10",
      summary_scope: "client",
      agency_id: "agency-1",
    }),
  ).toStrictEqual({ target_type: "agency", target_id: "agency-1" });
});

test("the longest transcript in a grouped meeting is used as the source", () => {
  const rows = [
    { id: "rec-audio", transcription: "   " },
    { id: "rec-video", transcription: "תמלול ארוך יותר של הפגישה" },
    { id: "rec-screen", transcription: "קצר" },
  ];

  expect(pickTranscriptRow(rows)?.id).toBe("rec-video");
  expect(pickTranscriptRow([{ id: "rec-empty", transcription: null }])).toBe(
    null,
  );
  expect(pickTranscriptRow([])).toBe(null);
});
