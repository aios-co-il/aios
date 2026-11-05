import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClientUpdateSourceChip } from "@/components/clients/ClientUpdateSourceChip";

describe("ClientUpdateSourceChip", () => {
  it.each([
    ["carmen", "כרמן"],
    ["carmen_confirmed", "כרמן"],
    ["system_send", "נשלח מהמערכת"],
    ["group_digest", "סיכום קבוצה"],
    ["automation", "אוטומציה"],
  ])("labels %s entries", (source, label) => {
    render(<ClientUpdateSourceChip source={source} />);
    expect(screen.getByTestId("client-update-source-chip")).toHaveTextContent(
      label,
    );
  });

  it("explains a confirmed Carmen entry on hover", () => {
    render(<ClientUpdateSourceChip source="carmen_confirmed" />);
    expect(screen.getByTestId("client-update-source-chip")).toHaveAttribute(
      "title",
      "כרמן רשמה את העדכון לבקשת איש הצוות",
    );
  });

  it.each([[undefined], [null], ["human"]])(
    "shows nothing for a person's own note (%s)",
    (source) => {
      const { container } = render(<ClientUpdateSourceChip source={source} />);
      expect(container).toBeEmptyDOMElement();
    },
  );
});
