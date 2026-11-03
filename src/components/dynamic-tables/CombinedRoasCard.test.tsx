import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CombinedRoasCard } from "./CombinedRoasCard";

describe("CombinedRoasCard", () => {
  it("shows the ROAS to two decimals", () => {
    render(<CombinedRoasCard roas={3.5} />);
    expect(screen.getByText("3.50")).toBeTruthy();
  });

  it("shows a dash, not 0.00, when no spend can be set against the revenue", () => {
    render(<CombinedRoasCard roas={null} />);
    expect(screen.getByText("-")).toBeTruthy();
    expect(screen.queryByText("0.00")).toBeNull();
  });
});
