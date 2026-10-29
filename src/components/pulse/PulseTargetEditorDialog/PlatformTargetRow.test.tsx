import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlatformTargetRow } from "./PlatformTargetRow";

describe("PlatformTargetRow", () => {
  it("names the goal and platform and shows the 4-week baseline as a hint", () => {
    render(
      <PlatformTargetRow
        context={{
          clientId: "client-1",
          clientName: "חנות",
          platform: "meta",
          primaryGoal: "ecommerce",
          platformTableIds: ["t1"],
          baselineEfficiency7d: 2.5,
        }}
        goal="ecommerce"
        tableIds={["t1"]}
        target={null}
        savingKey={null}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByText("כל קמפייני האיקומרס ב־Meta")).toBeTruthy();
    expect(screen.getByText("בסיס 4 שבועות: 2.50")).toBeTruthy();
  });
});
