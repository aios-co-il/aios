import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DelayStepConfig } from "./DelayStepConfig";
import { delayUnitLabel } from "./delayUnits";

describe("DelayStepConfig", () => {
  it("stores the amount under the key the engine reads", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DelayStepConfig configuration={{}} onChange={onChange} />);

    await user.type(screen.getByLabelText("זמן המתנה"), "7");

    expect(onChange).toHaveBeenCalledWith("delay_value", 7);
  });

  it("turns on the same-status check", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DelayStepConfig configuration={{}} onChange={onChange} />);

    await user.click(
      screen.getByLabelText("להמשיך רק אם הליד עדיין באותו סטטוס"),
    );

    expect(onChange).toHaveBeenCalledWith("delay_require_same_status", true);
  });

  it("shows a stored same-status check as on", () => {
    render(
      <DelayStepConfig
        configuration={{ delay_require_same_status: true }}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByLabelText("להמשיך רק אם הליד עדיין באותו סטטוס"),
    ).toBeChecked();
  });
});

describe("delayUnitLabel", () => {
  it("labels weeks, and falls back to minutes", () => {
    expect(delayUnitLabel("weeks")).toBe("שבועות");
    expect(delayUnitLabel(undefined)).toBe("דקות");
  });
});
