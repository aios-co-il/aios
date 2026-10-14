import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("forwards its DOM ref and supports keyboard activation", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    render(
      <Button ref={ref} onClick={onClick}>
        שמור
      </Button>,
    );

    const button = screen.getByRole("button", { name: "שמור" });
    expect(ref.current).toBe(button);
    await user.tab();
    expect(button).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("prevents activation when disabled after a rerender", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>שמור</Button>);
    await user.click(screen.getByRole("button", { name: "שמור" }));
    expect(onClick).toHaveBeenCalledOnce();

    rerender(
      <Button disabled onClick={onClick}>
        שמור
      </Button>,
    );
    const button = screen.getByRole("button", { name: "שמור" });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
