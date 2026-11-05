import { expect, test } from "vitest";
import {
  aggregateGscQueryRows,
  gscQueriesMatch,
  keywordTop20Rank,
  top20DisplayPosition,
} from "../../supabase/functions/_shared/gscPosition.ts";
import {
  ahrefsPositionsFromReports,
  betterDisplayRank,
  keywordDisplayPosition,
  mergeTrackedKeywordRows,
  trackedPhraseRank,
  trackedQueryPosition,
  visibleGscPosition,
} from "./gscPosition.ts";

test("top20DisplayPosition hides ranks outside the top 20 and blank zeros", () => {
  expect(top20DisplayPosition(8.24)).toBe(8.2);
  expect(top20DisplayPosition(20)).toBe(20);
  expect(top20DisplayPosition(20.4)).toBe(null);
  expect(top20DisplayPosition(0)).toBe(null);
  expect(top20DisplayPosition(null)).toBe(null);
  expect(top20DisplayPosition("")).toBe(null);
});

test("keywordTop20Rank keeps a Search Console top-20 rank when Ahrefs is worse", () => {
  const rank = keywordTop20Rank({ position: 46, gsc_position: 7.2 });
  expect(rank).toStrictEqual({ position: 7.2, source: "gsc" });
});

test("keywordTop20Rank prefers the better Ahrefs rank inside the top 20", () => {
  const rank = keywordTop20Rank({ position: 4, gsc_position: 11 });
  expect(rank).toStrictEqual({ position: 4, source: "ahrefs" });
});

test("keywordTop20Rank reads a GSC-only row from its own position", () => {
  const rank = keywordTop20Rank({
    _source: "gsc",
    position: 3.5,
    gsc_position: 3.5,
  });
  expect(rank).toStrictEqual({ position: 3.5, source: "gsc" });
  expect(keywordTop20Rank({ _source: "gsc", position: 28 })).toBe(null);
});

test("gscQueriesMatch is exact and does not treat a shorter query as the same phrase", () => {
  expect(gscQueriesMatch("נופר זומר", "נופר זומר")).toBe(true);
  expect(gscQueriesMatch("נופר זומר", "  נופר   זומר ")).toBe(true);
  expect(gscQueriesMatch("נופר זומר", "נופר")).toBe(false);
  expect(gscQueriesMatch("נופר", "נופר זומר עורכת דין")).toBe(false);
});

test("aggregateGscQueryRows weights by impressions and ignores position 0", () => {
  const [row] = aggregateGscQueryRows([
    { query: "נופר זומר", clicks: 1, impressions: 2, position: 3 },
    { query: "נופר זומר", clicks: 0, impressions: 100, position: 0 },
    { query: "נופר זומר", clicks: 4, impressions: 8, position: 18 },
  ]);
  expect(row.query).toBe("נופר זומר");
  expect(row.clicks).toBe(5);
  expect(row.impressions).toBe(110);
  // (3*2 + 18*8) / 10 = 15, not pulled into the top by the zero-position day.
  expect(row.position).toBe(15);
});

test("aggregateGscQueryRows does not invent a top-20 rank from an unweighted average", () => {
  const [row] = aggregateGscQueryRows([
    { query: "ביטוי רעש", clicks: 0, impressions: 1, position: 2 },
    { query: "ביטוי רעש", clicks: 1, impressions: 1000, position: 48 },
  ]);
  expect(row.position > 20).toBeTruthy();
  expect(top20DisplayPosition(row.position)).toBe(null);
});

test("visibleGscPosition blanks a rank the Top 20 list would hide", () => {
  expect(visibleGscPosition("נופר זומר", 6.1)).toBe(6.1);
  expect(visibleGscPosition("נופר זומר", 33)).toBe(null);
  expect(
    visibleGscPosition("בנק דיסקונט", 4, { tracked: ["נופר זומר עורכת דין"] }),
  ).toBe(null);
  expect(
    visibleGscPosition("נופר זומר", 4, {
      tracked: ["נופר זומר"],
      forceIrrelevant: ["נופר זומר"],
    }),
  ).toBe(null);
  expect(
    visibleGscPosition("עורך דין נופר זומר", 9, { tracked: ["נופר זומר"] }),
  ).toBe(9);
});

test("tracked phrases keep a position outside the top 20 when they have Search Console data", () => {
  expect(
    trackedQueryPosition("נופר זומר", 33.2, { tracked: ["נופר זומר"] }),
  ).toBe(33.2);
  expect(
    trackedQueryPosition("ביטוי אחר", 33, { tracked: ["נופר זומר"] }),
  ).toBe(null);
  expect(
    trackedQueryPosition("נופר זומר", 33, {
      tracked: ["נופר זומר"],
      forceIrrelevant: ["נופר זומר"],
    }),
  ).toBe(null);
});

test("tracked phrases show the better rank from Ahrefs or Search Console", () => {
  expect(
    keywordDisplayPosition({ position: null, gsc_position: 27.4 }),
  ).toStrictEqual({ position: 27.4, source: "gsc" });
  expect(
    keywordDisplayPosition({ position: 6, gsc_position: 27 }),
  ).toStrictEqual({
    position: 6,
    source: "ahrefs",
  });
  expect(
    betterDisplayRank({ ahrefsPosition: 46, gscPosition: 7.2 }),
  ).toStrictEqual({ position: 7.2, source: "gsc" });
  expect(
    keywordDisplayPosition({ position: 40, gsc_position: 33 }),
  ).toStrictEqual({
    position: 33,
    source: "gsc",
  });
  expect(
    keywordDisplayPosition({
      position: 7,
      ahrefs_position: 46,
      gsc_position: 7,
      _position_source: "gsc",
    }),
  ).toStrictEqual({ position: 7, source: "gsc" });
});

test("a tracked phrase on the Search Console list uses the better stored rank", () => {
  expect(
    trackedPhraseRank("נופר זומר", 33, {
      tracked: ["נופר זומר"],
      ahrefsPositions: { "נופר זומר": 14 },
    }),
  ).toStrictEqual({ position: 14, source: "ahrefs" });
  expect(
    trackedPhraseRank("נופר זומר", null, {
      tracked: ["נופר זומר"],
      ahrefsPositions: { "נופר זומר": 14 },
    }),
  ).toStrictEqual({ position: 14, source: "ahrefs" });
  expect(
    trackedPhraseRank("ביטוי אחר", 33, {
      tracked: ["נופר זומר"],
      ahrefsPositions: { "נופר זומר": 14 },
    }),
  ).toBe(null);
});

test("a later keyword list without ranks keeps the rank stored on an earlier report", () => {
  const merged = mergeTrackedKeywordRows(
    [{ keyword: "נופר זומר", position: 14, traffic: 8 }],
    [
      {
        keyword: "נופר זומר",
        position: null,
        traffic: 0,
        _source: "management-project-keywords",
      },
    ],
  );
  expect(merged[0].position).toBe(14);
  expect(merged[0].traffic).toBe(8);
  const positions = ahrefsPositionsFromReports([
    {
      report_data: {
        tracked_keywords: [{ keyword: "נופר זומר", position: null }],
      },
    },
    {
      report_data: {
        tracked_keywords: [{ keyword: "נופר זומר", position: 14 }],
      },
    },
  ]);
  expect(positions.get("נופר זומר")).toBe(14);
});
