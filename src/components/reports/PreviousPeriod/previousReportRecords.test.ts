import { describe, expect, it } from "vitest";
import { previousReportRecords } from "./previousReportRecords";

/** One campaign-level row. */
function row(campaign_id: string, campaign_name: string) {
  return { data: { entity_level: "campaign", campaign_id, campaign_name } };
}

describe("previousReportRecords", () => {
  it("keeps a renamed campaign's history under a search for its new name", () => {
    const shown = [row("c1", "קורס חורף")];
    const previous = [row("c1", "קורס סתיו"), row("c2", "אחר")];
    expect(
      previousReportRecords(previous, "campaign", { searching: true, shown }),
    ).toStrictEqual([row("c1", "קורס סתיו")]);
  });

  it("keeps every row at the level without a search", () => {
    const previous = [row("c1", "א"), row("c2", "ב")];
    expect(
      previousReportRecords(previous, "campaign", {
        searching: false,
        shown: [],
      }),
    ).toHaveLength(2);
  });
});
