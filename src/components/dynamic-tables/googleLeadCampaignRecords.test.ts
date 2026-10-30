import { describe, expect, it } from "vitest";
import type { GoogleCampaignGoal } from "../../../supabase/functions/_shared/pulse/google-campaign-goal.ts";
import {
  googleLeadCampaignRecords,
  googleManualRoiFigures,
} from "./googleLeadCampaignRecords";

const table = {
  id: "g",
  integration_type: "google_ads",
  integration_settings: { campaign_type: "leads" },
};
const record = (campaign: string, goal?: GoogleCampaignGoal) => ({
  data: {
    date: "2026-10-20",
    campaign_id: campaign,
    campaign_name: campaign,
    cost: 100,
    conversions: 2,
    ...(goal ? { conversion_goal: goal } : {}),
  },
});

describe("googleLeadCampaignRecords", () => {
  it("leaves sales campaigns out of lead-only figures", () => {
    const records = [
      record("shop", "ecommerce"),
      record("search", "leads"),
      record("old"),
    ];
    expect(
      googleLeadCampaignRecords(records, table).map((r) => r.data.campaign_id),
    ).toStrictEqual(["search", "old"]);
  });
});

describe("googleManualRoiFigures", () => {
  it("counts only lead campaigns' spend and conversions", () => {
    expect(
      googleManualRoiFigures(
        [record("shop", "ecommerce"), record("search", "leads")],
        table,
      ),
    ).toStrictEqual({ spend: 100, leads: 2 });
  });

  it("keeps the card for entered figures when no lead campaign ran", () => {
    const withFigures = {
      ...table,
      integration_settings: {
        campaign_type: "leads",
        manual_roi: { closures: 3 },
      },
    };
    expect(
      googleManualRoiFigures([record("shop", "ecommerce")], withFigures),
    ).toStrictEqual({ spend: 0, leads: 0 });
    expect(googleManualRoiFigures([record("shop", "ecommerce")], table)).toBe(
      null,
    );
  });

  it("hides the card on a sales table or an empty range without saved figures", () => {
    const salesTable = {
      ...table,
      integration_settings: { campaign_type: "ecommerce" },
    };
    expect(
      googleManualRoiFigures([record("search", "leads")], salesTable),
    ).toBe(null);
    expect(googleManualRoiFigures([], table)).toBe(null);
  });

  it("keeps saved figures on an empty range, against no spend", () => {
    const withFigures = {
      ...table,
      integration_settings: {
        campaign_type: "leads",
        manual_roi: { closures: 3 },
      },
    };
    expect(googleManualRoiFigures([], withFigures)).toStrictEqual({
      spend: 0,
      leads: 0,
    });
  });
});
