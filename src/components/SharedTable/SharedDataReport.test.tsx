import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { format, subDays } from "date-fns";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { stubRadixPointer } from "@/test/stubRadixPointer";
import { stubResizeObserver } from "@/test/stubResizeObserver";
import { withTestQuery } from "@/test/withTestQuery";
import { SharedDataReport } from "./SharedDataReport";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const table = {
  id: "table-1",
  name: "דוח פייסבוק",
  integration_type: "facebook_insights",
  integration_settings: { currency: "ILS" },
};

/** Yesterday's Facebook row of one campaign at one level. */
function day(
  level: "campaign" | "adset" | "ad",
  campaign: { id: string; name: string },
  entity: string,
  spend: number,
) {
  return {
    id: `${level}-${entity}`,
    data: {
      date: format(subDays(new Date(), 1), "yyyy-MM-dd"),
      entity_level: level,
      campaign_id: campaign.id,
      campaign_name: campaign.name,
      campaign_objective: "OUTCOME_LEADS",
      adset_id: `set-${entity}`,
      adset_name: `סט ${entity}`,
      ad_id: `ad-${entity}`,
      ad_name: `מודעה ${entity}`,
      impressions: 1000,
      clicks: 20,
      spend,
      leads: 2,
    },
  };
}

const winter = { id: "c1", name: "קמפיין חורף" };
const summer = { id: "c2", name: "קמפיין קיץ" };
const records = [
  day("campaign", winter, "w", 100),
  day("campaign", summer, "s", 300),
  day("adset", winter, "w", 100),
  day("adset", summer, "s", 300),
  day("ad", winter, "w", 100),
  day("ad", summer, "s", 300),
];

/** The share's report over the two campaigns' rows. */
function renderReport() {
  return render(
    withTestQuery(
      <SharedDataReport
        shareToken="share-token"
        data={{ table, fields: [], records }}
        table={table}
        dates={{ filter: "last_7_days" }}
        onDatesChange={() => undefined}
        ready
        summaryOnly={false}
      />,
    ),
  );
}

beforeAll(stubRadixPointer);

beforeEach(stubResizeObserver);

describe("SharedDataReport campaign picker", () => {
  it("is not offered on the campaign tab", async () => {
    renderReport();

    expect(await screen.findByText("קמפיין חורף")).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "סינון לפי קמפיין" }),
    ).toBeNull();
  });

  it("narrows the ad tab to the picked campaign and keeps it on the ad set tab", async () => {
    const user = userEvent.setup();
    renderReport();

    await user.click(await screen.findByRole("tab", { name: "מודעות" }));
    expect(screen.getByText(/מודעה w/)).toBeInTheDocument();
    expect(screen.getByText(/מודעה s/)).toBeInTheDocument();
    // The goal table's totals and the KPI cards sum both campaigns.
    expect(screen.getAllByText(/₪400/).length).toBeGreaterThan(0);

    await user.click(
      screen.getByRole("combobox", { name: "סינון לפי קמפיין" }),
    );
    const options = screen.getAllByRole("option");
    // Biggest spend first, after "every campaign".
    expect(options.map((option) => option.textContent)).toEqual([
      "כל הקמפיינים",
      "קמפיין קיץ",
      "קמפיין חורף",
    ]);
    await user.click(screen.getByRole("option", { name: "קמפיין חורף" }));

    expect(screen.getByText(/מודעה w/)).toBeInTheDocument();
    expect(screen.queryByText(/מודעה s/)).toBeNull();
    expect(screen.queryByText(/₪400/)).toBeNull();

    await user.click(screen.getByRole("tab", { name: "קבוצות מודעות" }));
    expect(screen.getByText(/סט w/)).toBeInTheDocument();
    expect(screen.queryByText(/סט s/)).toBeNull();
    expect(
      within(
        screen.getByRole("combobox", { name: "סינון לפי קמפיין" }),
      ).getByText("קמפיין חורף"),
    ).toBeInTheDocument();
  });
});
