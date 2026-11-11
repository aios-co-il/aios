import { describe, expect, it } from "vitest";
import { summarizeLeads } from "./leadsSummary";

const now = new Date(2026, 10, 11, 12, 0);

describe("summarizeLeads", () => {
  it("returns zeros for no leads", () => {
    expect(summarizeLeads([], now)).toEqual({
      createdToday: 0,
      followUpToday: 0,
      followUpOverdue: 0,
    });
  });

  it("counts today's leads and due and late follow-ups", () => {
    const leads = [
      { created_at: new Date(2026, 10, 11, 9).toISOString() },
      { created_at: new Date(2026, 10, 10, 9).toISOString() },
      { follow_up_date: "2026-11-11" },
      { follow_up_date: "2026-11-09" },
      { follow_up_date: "2026-11-01" },
      { follow_up_date: "2026-11-30" },
      { follow_up_date: null, created_at: null },
    ];
    expect(summarizeLeads(leads, now)).toEqual({
      createdToday: 1,
      followUpToday: 1,
      followUpOverdue: 2,
    });
  });
});
