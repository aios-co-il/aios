import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdsGoalTables } from "@/components/reports/AdsGoalTables/AdsGoalTables";
import type { AdsEntityLevel } from "@/lib/adsEntityLevel";
import { withTestQuery } from "@/test/withTestQuery";
import type { AdPreviewSource } from "./AdPreviewContext";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke } },
}));

const PREVIEW_SRC =
  "https://www.facebook.com/ads/api/preview_iframe.php?d=AQ1&t=AQ2";

const facebookTable = {
  id: "table-1",
  integration_type: "facebook_insights",
  integration_settings: { currency: "ILS" },
};

/** One Facebook lead ad's day, as the ad-level sync stores it. */
const adRecord = {
  data: {
    date: "2026-11-20",
    entity_level: "ad",
    ad_id: "120210000000000001",
    ad_name: "Spring ad",
    campaign_id: "c1",
    campaign_name: "Spring ad",
    spend: 100,
    leads: 4,
    impressions: 1000,
    clicks: 50,
  },
};

/** The shared goal tables both report pages render, at this level and preview source. */
function renderTables(level: AdsEntityLevel, adPreview: AdPreviewSource) {
  render(
    withTestQuery(
      <AdsGoalTables
        table={facebookTable}
        records={[adRecord]}
        previousRecords={undefined}
        level={level}
        woo={null}
        manualRoi={{ readOnly: true }}
        showTrackingWarnings={false}
        adPreview={adPreview}
      />,
    ),
  );
}

describe("FacebookEntityNameCell", () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue({ data: { src: PREVIEW_SRC }, error: null });
  });

  it("opens the ad's preview from a share link when its name is clicked", async () => {
    const user = userEvent.setup();
    renderTables("ad", { shareToken: "share-token" });

    await user.click(screen.getByRole("button", { name: "Spring ad" }));

    const frame = await screen.findByTitle("תצוגה מקדימה: Spring ad");
    expect(frame).toHaveAttribute("src", PREVIEW_SRC);
    expect(frame).toHaveAttribute(
      "sandbox",
      "allow-scripts allow-same-origin allow-popups",
    );
    expect(invoke).toHaveBeenCalledWith("ad-preview", {
      body: { ad_id: "120210000000000001", share_token: "share-token" },
    });
  });

  it("asks with the table on the internal report", async () => {
    const user = userEvent.setup();
    renderTables("ad", { tableId: "table-1" });

    await user.click(screen.getByRole("button", { name: "Spring ad" }));

    await screen.findByTitle("תצוגה מקדימה: Spring ad");
    expect(invoke).toHaveBeenCalledWith("ad-preview", {
      body: { ad_id: "120210000000000001", table_id: "table-1" },
    });
  });

  it("leaves campaign rows as plain names", () => {
    renderTables("campaign", { tableId: "table-1" });

    expect(screen.getByText("Spring ad")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Spring ad" })).toBeNull();
  });

  it("says so when the preview cannot load", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("refused") });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    renderTables("ad", { shareToken: "share-token" });

    await user.click(screen.getByRole("button", { name: "Spring ad" }));

    expect(
      await screen.findByText(/לא ניתן לטעון את התצוגה המקדימה/),
    ).toBeInTheDocument();
  });
});
