import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useContinentsReportView } from "./useContinentsReportView";

const named = (field: "campaign_name" | "campaign", ...names: Array<string>) =>
  names.map((name) => ({ data: { [field]: name } }));

const ECHO = named(
  "campaign_name",
  "טיול לפטגוניה - Pmax",
  "טיול ליפן - Pmax",
  "טיולי חורף - Pmax",
);

describe("useContinentsReportView", () => {
  it("offers the tab for destination campaigns, read from campaign_name or campaign", () => {
    const fromName = renderHook(() =>
      useContinentsReportView({
        integrationType: "google_ads",
        records: ECHO,
        ready: true,
      }),
    );
    expect(fromName.result.current.hasContinentsTab).toBe(true);
    const fromCampaign = renderHook(() =>
      useContinentsReportView({
        integrationType: "google_ads",
        records: named("campaign", "טיול לפטגוניה", "טיול ליפן"),
        ready: true,
      }),
    );
    expect(fromCampaign.result.current.hasContinentsTab).toBe(true);
  });

  it("keeps the continents view while the next period is loading", () => {
    const { result, rerender } = renderHook(
      (props: { records: typeof ECHO; ready: boolean }) =>
        useContinentsReportView({ integrationType: "google_ads", ...props }),
      { initialProps: { records: ECHO, ready: true } },
    );
    act(() => result.current.setView("continents"));
    rerender({ records: [], ready: false });
    expect(result.current.view).toBe("continents");
    rerender({ records: ECHO, ready: true });
    expect(result.current.view).toBe("continents");
  });

  it("goes back to the report once a loaded period has no destination campaigns", () => {
    const { result, rerender } = renderHook(
      (props: { records: typeof ECHO; ready: boolean }) =>
        useContinentsReportView({ integrationType: "google_ads", ...props }),
      { initialProps: { records: ECHO, ready: true } },
    );
    act(() => result.current.setView("continents"));
    rerender({
      records: named("campaign_name", "Brand search", "רימרקטינג"),
      ready: true,
    });
    expect(result.current.view).toBe("summary");
  });

  it("never offers the tab outside Google Ads", () => {
    const { result } = renderHook(() =>
      useContinentsReportView({
        integrationType: "facebook_insights",
        records: ECHO,
        ready: true,
      }),
    );
    expect(result.current.hasContinentsTab).toBe(false);
  });
});
