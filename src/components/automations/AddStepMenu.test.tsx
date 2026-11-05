import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AddStepMenu } from "./AddStepMenu";

describe("AddStepMenu", () => {
  it("opens its Hebrew menu with Radix right-to-left direction", async () => {
    const onAdd = vi.fn();
    render(<AddStepMenu onAdd={onAdd} />);
    await userEvent.click(screen.getByRole("button", { name: "הוסף צעד" }));
    expect(screen.getByRole("menu")).toHaveAttribute("dir", "rtl");
    await userEvent.click(screen.getByRole("menuitem", { name: "פעולה" }));
    expect(onAdd).toHaveBeenCalledWith("action");
  });
});
