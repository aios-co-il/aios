import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SourceBadge } from "./SourceBadge";

describe("SourceBadge", () => {
  it("names the source and shows Carmen's rationale on hover", () => {
    render(
      <SourceBadge
        target={{
          value: 60,
          kind: "cpl",
          direction: "maximum",
          source: "carmen_market",
          scope: "campaign",
          rationale: "ענף שיפוצים ₪50–70",
          set_at: null,
          set_by: null,
        }}
      />,
    );
    expect(screen.getByText("יעד שוק (כרמן)")).toHaveAttribute(
      "title",
      "ענף שיפוצים ₪50–70",
    );
  });

  it("says when there is no target", () => {
    render(<SourceBadge target={null} />);
    expect(screen.getByText("אין יעד")).toBeTruthy();
  });
});
