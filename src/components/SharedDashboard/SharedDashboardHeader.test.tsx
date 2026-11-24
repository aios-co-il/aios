import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdAccountShortcut } from "@/lib/adAccountUrl";
import { withTestQuery } from "@/test/withTestQuery";
import { SharedDashboardHeader } from "./SharedDashboardHeader";

const links: Array<AdAccountShortcut> = [
  {
    url: "https://business.facebook.com/adsmanager/manage/campaigns?act=111",
    platform: "meta",
    label: "חשבון Facebook",
  },
  {
    url: "https://ads.google.com/aw/overview?__e=1234567890",
    platform: "google",
    label: "חשבון Google Ads",
  },
];

/** The header as SharedDashboard renders it, with the given links. */
function header(snapshotMode: boolean) {
  return withTestQuery(
    <SharedDashboardHeader
      shareToken="share-token"
      dashboard={{ name: "דשבורד לקוח" }}
      adAccountLinks={links}
      tabItems={[]}
      tab="all"
      onTabChange={() => undefined}
      dateFilter="last_7_days"
      onDateFilterChange={() => undefined}
      comparePrevious={false}
      onComparePreviousChange={() => undefined}
      previous={{ range: null, loading: false }}
      snapshotMode={snapshotMode}
    />,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SharedDashboardHeader", () => {
  it("opens each ad account public-dashboard sends", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    const user = userEvent.setup();
    render(header(false));

    await user.click(screen.getByRole("button", { name: "חשבון Google Ads" }));

    expect(
      screen.getByRole("button", { name: "חשבון Facebook" }),
    ).toBeInTheDocument();
    expect(open).toHaveBeenCalledWith(
      links[1].url,
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("shows no ad account button in the send capture", () => {
    render(header(true));

    expect(screen.queryByRole("button", { name: /חשבון/ })).toBeNull();
  });
});
