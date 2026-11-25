import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MiniMe } from "./MiniMe";
import { MiniMeGenderContext, resolveMiniMeGender } from "./miniMeGender";
import { CARMEN_ROLES } from "../../../../supabase/functions/_shared/carmen/skin-roles";

/** The image file each rendered Mini Me shows, in document order. */
function shownImages(container: HTMLElement) {
  return [...container.querySelectorAll("img")].map((img) =>
    img.getAttribute("src"),
  );
}

describe("MiniMe", () => {
  it("shows the skin's own render", () => {
    const { container } = render(<MiniMe skin="cfo" label="כספים" />);

    expect(shownImages(container)[0]).toContain("cfo-male");
  });

  it("is the classic without a skin, and decorative without a label", () => {
    const { container } = render(<MiniMe />);

    expect(container.querySelector(".mini-me")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(shownImages(container)[0]).toContain("classic-male");
  });

  it("has a render of its own for every skin, in both sets", () => {
    const { container } = render(
      <>
        {CARMEN_ROLES.map((role) => (
          <span key={role.slug}>
            <MiniMe skin={role.slug} gender="male" />
            <MiniMe skin={role.slug} gender="female" />
          </span>
        ))}
      </>,
    );
    const expected = CARMEN_ROLES.flatMap((role) => [
      expect.stringContaining(`${role.slug}-male`),
      expect.stringContaining(`${role.slug}-female`),
    ]);

    expect(shownImages(container)).toEqual(expected);
  });

  it("follows the signed-in user's set from context unless a gender is passed", () => {
    const { container } = render(
      <MiniMeGenderContext.Provider value="female">
        <MiniMe />
        <MiniMe gender="male" />
      </MiniMeGenderContext.Provider>,
    );

    expect(shownImages(container)).toEqual([
      expect.stringContaining("classic-female"),
      expect.stringContaining("classic-male"),
    ]);
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
