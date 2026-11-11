import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ColorPicker } from "@/components/ui/color-picker";

describe("ColorPicker", () => {
  it("reports a preset once when it is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ColorPicker value="#3B82F6" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "בחירת צבע" }));
    await user.click(screen.getByRole("button", { name: "#ef4444" }));

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith("#ef4444");
  });

  it("commits a typed hex on Enter in normalized form", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ColorPicker value="#3b82f6" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "בחירת צבע" }));
    const hexInput = screen.getByRole("textbox", { name: "קוד צבע" });
    await user.clear(hexInput);
    await user.type(hexInput, "F60{Enter}");
    await user.keyboard("{Escape}");

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith("#ff6600");
  });

  it("flags an invalid hex and does not report it", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ColorPicker value="#3b82f6" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "בחירת צבע" }));
    const hexInput = screen.getByRole("textbox", { name: "קוד צבע" });
    await user.clear(hexInput);
    await user.type(hexInput, "#12");

    expect(hexInput).toHaveAttribute("aria-invalid", "true");
    await user.keyboard("{Enter}");
    expect(hexInput).toHaveValue("#3b82f6");
    expect(onChange).not.toHaveBeenCalled();
  });
});
