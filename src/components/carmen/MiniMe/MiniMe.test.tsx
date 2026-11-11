import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MiniMe } from "./MiniMe";

describe("MiniMe", () => {
  it("tints the glass with the skin's color and adds its prop", () => {
    const { container } = render(<MiniMe skin="cfo" label="כספים" />);
    const stops = [...container.querySelectorAll("stop")].map((stop) =>
      stop.getAttribute("stop-color"),
    );
    expect(stops).toContain("hsl(160 64% 40%)");
    // The CFO holds a shekel coin.
    expect(container.textContent).toContain("₪");
  });

  it("is the plain brand-colored classic without a skin, and decorative without a label", () => {
    const { container } = render(<MiniMe />);
    const svg = container.querySelector("svg.mini-me");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("stop")).toHaveAttribute(
      "stop-color",
      "hsl(var(--brand-accent-100))",
    );
  });

  it("gives each figure its own gradient ids, so two on a page do not share colors", () => {
    const { container } = render(
      <>
        <MiniMe skin="cfo" />
        <MiniMe skin="copywriter" />
      </>,
    );
    const ids = [...container.querySelectorAll("radialGradient")].map(
      (gradient) => gradient.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});
