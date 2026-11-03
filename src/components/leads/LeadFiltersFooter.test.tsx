import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { LeadFiltersFooter } from "./LeadFiltersFooter";

function renderFooter(overrides: { isSaving?: boolean } = {}) {
  const onSavePreset = vi.fn();
  render(
    <LeadFiltersFooter
      isEditingPreset={false}
      hasActiveFilters
      isSaving={overrides.isSaving ?? false}
      isUpdating={false}
      onReset={vi.fn()}
      onApply={vi.fn()}
      onUpdatePreset={vi.fn()}
      onSavePreset={onSavePreset}
    />,
  );
  return { onSavePreset };
}

describe("LeadFiltersFooter", () => {
  test("asks for the preset name in place and saves the trimmed name", async () => {
    const user = userEvent.setup();
    const { onSavePreset } = renderFooter();

    await user.click(screen.getByRole("button", { name: "שמור כפריסט" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("שם הפריסט"), "  לידים חמים ");
    await user.click(screen.getByRole("button", { name: "שמור פריסט" }));

    expect(onSavePreset).toHaveBeenCalledWith("לידים חמים");
  });

  test("Enter in the name field saves", async () => {
    const user = userEvent.setup();
    const { onSavePreset } = renderFooter();

    await user.click(screen.getByRole("button", { name: "שמור כפריסט" }));
    await user.type(screen.getByLabelText("שם הפריסט"), "חמים{Enter}");

    expect(onSavePreset).toHaveBeenCalledWith("חמים");
  });

  test("an empty name cannot be saved", async () => {
    const user = userEvent.setup();
    renderFooter();

    await user.click(screen.getByRole("button", { name: "שמור כפריסט" }));

    expect(screen.getByRole("button", { name: "שמור פריסט" })).toBeDisabled();
  });

  test("cancel returns to the filter actions", async () => {
    const user = userEvent.setup();
    renderFooter();

    await user.click(screen.getByRole("button", { name: "שמור כפריסט" }));
    await user.click(screen.getByRole("button", { name: "ביטול" }));

    expect(screen.queryByLabelText("שם הפריסט")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "החל פילטרים" }),
    ).toBeInTheDocument();
  });
});
