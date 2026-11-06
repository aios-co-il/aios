import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PulseTrafficMetrics } from "./PulseTrafficMetrics";

const formatNumber = (value: number) => value.toLocaleString("he-IL");

describe("PulseTrafficMetrics", () => {
  it("shows CTR and new followers, not clicks already shown as the outcome", () => {
    render(
      <PulseTrafficMetrics
        row={{
          outcome_kind: "link_clicks",
          clicks_7d: 560,
          ctr_7d: 2,
          new_followers_7d: 60,
        }}
        formatNumber={formatNumber}
      />,
    );
    expect(screen.getByText("2%")).toBeTruthy();
    expect(screen.getByText(/עוקבים חדשים/)).toBeTruthy();
    expect(screen.getByText("60")).toBeTruthy();
    expect(screen.queryByText(/קליקים/)).toBeNull();
  });

  it("shows clicks for a video campaign and hides followers without a count", () => {
    render(
      <PulseTrafficMetrics
        row={{
          outcome_kind: "video_views",
          clicks_7d: 45,
          ctr_7d: null,
          new_followers_7d: null,
        }}
        formatNumber={formatNumber}
      />,
    );
    expect(screen.getByText("45")).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.queryByText(/עוקבים חדשים/)).toBeNull();
  });
});
