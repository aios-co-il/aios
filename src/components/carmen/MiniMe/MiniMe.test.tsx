import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MiniMe } from "./MiniMe";
import { MiniMeGenderContext, resolveMiniMeGender } from "./miniMeGender";

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

  it("draws the male set by default and the female touches when asked", () => {
    const male = render(<MiniMe skin="cfo" />).container;
    expect(male.querySelector(".mini-me-female")).toBeNull();
    const female = render(<MiniMe skin="cfo" gender="female" />).container;
    expect(female.querySelector(".mini-me-female")).not.toBeNull();
    expect(female.querySelector("svg")).toHaveAttribute(
      "data-gender",
      "female",
    );
  });

  it("follows the signed-in user's set from context unless a gender is passed", () => {
    const { container } = render(
      <MiniMeGenderContext.Provider value="female">
        <MiniMe />
        <MiniMe gender="male" />
      </MiniMeGenderContext.Provider>,
    );
    const genders = [...container.querySelectorAll("svg.mini-me")].map((svg) =>
      svg.getAttribute("data-gender"),
    );
    expect(genders).toEqual(["female", "male"]);
  });
});

describe("resolveMiniMeGender", () => {
  it("prefers the user's choice, then their address gender, then male", () => {
    expect(resolveMiniMeGender("male", "female")).toBe("male");
    expect(resolveMiniMeGender(null, "female")).toBe("female");
    expect(resolveMiniMeGender(null, null)).toBe("male");
    expect(resolveMiniMeGender("other", "male")).toBe("male");
  });
});
