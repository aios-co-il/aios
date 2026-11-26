import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HeaderSearch } from "./HeaderSearch";
import { HeaderSearchProvider } from "./HeaderSearchProvider";
import { HeaderSearchSlot } from "./HeaderSearchSlot";

/** An app frame with the header slot and a screen below it. */
function Frame({ showSearch }: { showSearch: boolean }) {
  return (
    <HeaderSearchProvider>
      <header aria-label="header">
        <HeaderSearchSlot />
      </header>
      <main>
        {showSearch && (
          <HeaderSearch>
            <input placeholder="חפש לקוח..." />
          </HeaderSearch>
        )}
      </main>
    </HeaderSearchProvider>
  );
}

describe("HeaderSearch", () => {
  it("shows the screen's search box inside the header", () => {
    render(<Frame showSearch />);

    const header = screen.getByLabelText("header");

    expect(within(header).getByPlaceholderText("חפש לקוח...")).toBeVisible();
    expect(
      within(screen.getByRole("main")).queryByPlaceholderText("חפש לקוח..."),
    ).toBeNull();
  });

  it("empties the header when the screen has no search", () => {
    const { rerender } = render(<Frame showSearch />);

    rerender(<Frame showSearch={false} />);

    expect(screen.queryByPlaceholderText("חפש לקוח...")).toBeNull();
  });

  it("renders in place outside the app layout", () => {
    render(
      <main>
        <HeaderSearch>
          <input placeholder="חפש לקוח..." />
        </HeaderSearch>
      </main>,
    );

    expect(
      within(screen.getByRole("main")).getByPlaceholderText("חפש לקוח..."),
    ).toBeVisible();
  });
});
