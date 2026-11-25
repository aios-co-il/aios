import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AdsGoalTables } from "@/components/reports/AdsGoalTables/AdsGoalTables";
import { withTestQuery } from "@/test/withTestQuery";

const googleTable = {
  id: "table-g",
  integration_type: "google_ads",
  integration_settings: { campaign_type: "leads", currency: "ILS" },
};

/** One Google lead ad's day, as the ad-level sync stores it. */
function adDay(adName: string, content: Record<string, unknown>) {
  return {
    data: {
      date: "2026-11-20",
      entity_level: "ad",
      ad_id: `id-${adName}`,
      ad_name: adName,
      campaign_id: adName,
      campaign_name: adName,
      conversion_goal: "leads",
      cost: 100,
      conversions: 4,
      impressions: 1000,
      clicks: 50,
      ...content,
    },
  };
}

const searchAd = adDay("Search ad", {
  ad_type: "RESPONSIVE_SEARCH_AD",
  ad_headlines: ["Shoes on sale", "Free shipping", "Easy returns", "Fourth"],
  ad_descriptions: ["Buy today and save."],
  ad_final_url: "https://www.shop.example.com/sale",
  ad_display_path: "shoes/sale",
});

/** The shared goal tables both report pages render, at the ad level, from a share link. */
function renderTables(records: Array<{ data: Record<string, unknown> }>) {
  render(
    withTestQuery(
      <AdsGoalTables
        table={googleTable}
        records={records}
        previousRecords={undefined}
        level="ad"
        woo={null}
        manualRoi={{ readOnly: true }}
        showTrackingWarnings={false}
        adPreview={{ shareToken: "share-token" }}
      />,
    ),
  );
}

describe("GoogleEntityNameCell", () => {
  it("opens a search ad's card with its headlines and description", async () => {
    const user = userEvent.setup();
    renderTables([searchAd]);

    await user.click(screen.getByRole("button", { name: "Search ad" }));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("Shoes on sale | Free shipping | Easy returns"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Buy today and save.")).toBeInTheDocument();
    expect(
      within(dialog).getByText("shop.example.com/shoes/sale"),
    ).toBeInTheDocument();
    const link = within(dialog).getByRole("link", { name: /דף הנחיתה/ });
    expect(link).toHaveAttribute("href", "https://www.shop.example.com/sale");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("notes an ad type that has no search preview", async () => {
    const user = userEvent.setup();
    renderTables([
      adDay("Video ad", {
        ad_type: "VIDEO_RESPONSIVE_AD",
        ad_headlines: ["Watch now"],
      }),
    ]);

    await user.click(screen.getByRole("button", { name: "Video ad" }));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("אין תצוגה מקדימה לסוג מודעה זה"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Watch now")).toBeInTheDocument();
  });

  it("leaves an ad synced before its copy was stored as a plain name", () => {
    renderTables([adDay("Old ad", {})]);

    expect(screen.getByText("Old ad")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Old ad" })).toBeNull();
  });

  it("leaves an ad with a type but no copy as a plain name", () => {
    renderTables([adDay("Shopping ad", { ad_type: "SHOPPING_PRODUCT_AD" })]);

    expect(screen.getByText("Shopping ad")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Shopping ad" })).toBeNull();
  });

  it("does not link a final URL that is not http or https", async () => {
    const user = userEvent.setup();
    renderTables([
      adDay("Odd ad", {
        ad_type: "RESPONSIVE_SEARCH_AD",
        ad_headlines: ["Click"],
        ad_final_url: "javascript:alert(1)",
      }),
    ]);

    await user.click(screen.getByRole("button", { name: "Odd ad" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Click")).toBeInTheDocument();
    expect(within(dialog).queryByRole("link")).toBeNull();
  });
});
