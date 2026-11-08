import { describe, expect, it } from "vitest";
import { completeRatio } from "./editorRows";

const chosen = [
  { event: "ticket_valuation", label: "הערכה" },
  { event: "ticket_sold", label: "מכירה" },
];

describe("completeRatio", () => {
  it("saves a pair of two different checked events", () => {
    expect(
      completeRatio({ from: "ticket_valuation", to: "ticket_sold" }, chosen),
    ).toEqual({ from: "ticket_valuation", to: "ticket_sold" });
  });

  it("drops a pair with a missing or unchecked side", () => {
    expect(completeRatio({ from: "ticket_valuation" }, chosen)).toBeNull();
    expect(
      completeRatio({ from: "ticket_valuation", to: "purchase" }, chosen),
    ).toBeNull();
  });
});
