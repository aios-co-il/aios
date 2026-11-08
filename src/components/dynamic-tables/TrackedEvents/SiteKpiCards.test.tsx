import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteKpiCards } from "./SiteKpiCards";

const format = {
  formatCurrency: (value: number) => `₪${Math.round(value)}`,
  formatNumber: (value: number) => String(value),
};

describe("SiteKpiCards", () => {
  it("shows the revenue and the conversion with its counts", () => {
    render(
      <SiteKpiCards
        revenue={3458}
        ratio={{
          label: "הערכה ← מכירה",
          done: 6,
          of: 27,
          rate: 6 / 27,
          basis: "people",
        }}
        {...format}
      />,
    );
    expect(screen.getByText("₪3458")).toBeTruthy();
    expect(screen.getByText("22.2%")).toBeTruthy();
    expect(screen.getByText("6 מתוך 27 משתמשים")).toBeTruthy();
  });

  it("shows nothing without revenue or a pair", () => {
    const { container } = render(
      <SiteKpiCards revenue={0} ratio={null} {...format} />,
    );
    expect(container.textContent).toBe("");
  });
});

describe("SiteKpiCards revenue sign", () => {
  it("still shows a net-negative revenue", () => {
    render(<SiteKpiCards revenue={-120} ratio={null} {...format} />);
    expect(screen.getByText("₪-120")).toBeTruthy();
  });
});
