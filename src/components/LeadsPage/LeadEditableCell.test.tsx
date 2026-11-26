import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LeadEditableCell } from "./LeadEditableCell";

/** Renders a phone cell and returns the save spy and a user session. */
function renderPhoneCell(trigger?: "cell" | "icon") {
  const onSave = vi.fn();
  render(
    <LeadEditableCell
      kind="tel"
      value="050-1111111"
      label="טלפון"
      trigger={trigger}
      onSave={onSave}
    >
      <span>050-1111111</span>
    </LeadEditableCell>,
  );

  return { onSave, user: userEvent.setup() };
}

describe("LeadEditableCell", () => {
  it("saves the typed value and closes the field when ✓ is pressed", async () => {
    const { onSave, user } = renderPhoneCell();

    await user.click(screen.getByTitle("עריכת טלפון"));
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), " 052-2222222 ");
    await user.click(screen.getByRole("button", { name: "שמור" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith("052-2222222");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("saves on Enter", async () => {
    const { onSave, user } = renderPhoneCell();

    await user.click(screen.getByTitle("עריכת טלפון"));
    await user.type(screen.getByRole("textbox"), "9{Enter}");

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith("050-11111119");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("saves when the field is left", async () => {
    const { onSave, user } = renderPhoneCell();

    await user.click(screen.getByTitle("עריכת טלפון"));
    await user.type(screen.getByRole("textbox"), "9");
    await user.tab({ shift: true });

    expect(onSave).toHaveBeenCalledWith("050-11111119");
  });

  it("cancels on Esc without saving", async () => {
    const { onSave, user } = renderPhoneCell();

    await user.click(screen.getByTitle("עריכת טלפון"));
    await user.type(screen.getByRole("textbox"), "9{Escape}");

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("050-1111111")).toBeVisible();
  });

  it("closes without saving when the value did not change", async () => {
    const { onSave, user } = renderPhoneCell();

    await user.click(screen.getByTitle("עריכת טלפון"));
    await user.click(screen.getByRole("button", { name: "שמור" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("edits from the pencil when the value has clicks of its own", async () => {
    const { user } = renderPhoneCell("icon");

    await user.click(screen.getByText("050-1111111"));
    expect(screen.queryByRole("textbox")).toBeNull();

    await user.click(screen.getByRole("button", { name: "עריכת טלפון" }));
    expect(screen.getByRole("textbox")).toHaveValue("050-1111111");
  });
});
