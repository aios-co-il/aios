import { describe, expect, it } from "vitest";
import { rangeSyncFailureMessage } from "./rangeSyncFailureMessage";

const BASE = {
  tableId: "table-1",
  piecesTotal: 4,
  recordsSynced: 0,
  byLevel: null,
};

describe("rangeSyncFailureMessage", () => {
  it("names the failed days, the reason and the pieces kept", () => {
    expect(
      rangeSyncFailureMessage({
        ...BASE,
        piecesDone: 1,
        failure: {
          piece: { startDate: "2026-08-30", endDate: "2026-09-28" },
          message: "504 IDLE_TIMEOUT",
        },
      }),
    ).toBe(
      "הסנכרון נכשל בימים 30/08/2026–28/09/2026: 504 IDLE_TIMEOUT (1/4 חלקים נשמרו)",
    );
  });

  it("is empty for a sync that did not fail", () => {
    expect(
      rangeSyncFailureMessage({ ...BASE, piecesDone: 4, failure: null }),
    ).toBe("");
  });
});
