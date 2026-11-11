import { describe, expect, it } from "vitest";
import {
  emptyReportFigures,
  type ReportFigures,
} from "../metrics/reportFigures";
import type { ReportCampaignRow, ReportData } from "./reportData";
import { reportInsightRequestOf } from "./reportInsightRequest";

function figures(fields: Partial<ReportFigures>): ReportFigures {
  return { ...emptyReportFigures(), ...fields };
}

function campaign(name: string, spend: number): ReportCampaignRow {
  return {
    key: name,
    name,
    channel: "facebook",
    on: true,
    figures: figures({ spend }),
  };
}

describe("reportInsightRequestOf", () => {
  it("sends each scope with its previous period and Analytics sessions", () => {
    const data: ReportData = {
      currency: "ILS",
      goals: ["leads"],
      askCarmen: true,
      scopes: {
        leads: {
          figures: figures({
            spend: 100,
            leads: 4,
            analytics: { sessions: 30, revenue: 0, purchases: 0, addToCart: 0 },
          }),
          previous: figures({ spend: 80, leads: 2 }),
          channels: [],
          daily: [],
          campaigns: [campaign("א", 100)],
        },
      },
    };
    expect(reportInsightRequestOf(data)).toEqual({
      currency: "ILS",
      scopes: [
        {
          scope: "leads",
          figures: expect.objectContaining({
            spend: 100,
            leads: 4,
            sessions: 30,
          }),
          previous: expect.objectContaining({ spend: 80, sessions: null }),
          campaigns: [
            expect.objectContaining({
              name: "א",
              channel: "facebook",
              on: true,
            }),
          ],
        },
      ],
    });
  });

  it("keeps the 15 largest spenders, largest first", () => {
    const campaigns = Array.from({ length: 20 }, (_, i) =>
      campaign(`c${i}`, i),
    );
    const data: ReportData = {
      currency: "ILS",
      goals: ["traffic"],
      askCarmen: true,
      scopes: {
        traffic: {
          figures: figures({}),
          previous: null,
          channels: [],
          daily: [],
          campaigns,
        },
      },
    };
    const sent = reportInsightRequestOf(data).scopes[0].campaigns;
    expect(sent).toHaveLength(15);
    expect(sent[0].name).toBe("c19");
    expect(sent.at(-1)?.name).toBe("c5");
  });
});
