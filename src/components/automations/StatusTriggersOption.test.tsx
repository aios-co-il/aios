import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StatusTriggersOption } from "./StatusTriggersOption";

describe("StatusTriggersOption", () => {
  it("turns the option on", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<StatusTriggersOption checked={false} onChange={onChange} />);

    await user.click(screen.getByLabelText("להפעיל אוטומציות של החלפת סטטוס"));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("shows a stored option as on", () => {
    render(<StatusTriggersOption checked onChange={vi.fn()} />);

    expect(
      screen.getByLabelText("להפעיל אוטומציות של החלפת סטטוס"),
    ).toBeChecked();
  });
});
