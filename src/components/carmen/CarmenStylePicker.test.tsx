import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { CarmenStylePicker } from "./CarmenStylePicker";

const state = vi.hoisted(() => ({
  style: "orbs" as "orbs" | "character",
  isOwner: true,
  saving: false,
  setStyle: vi.fn(),
}));
vi.mock("@/hooks/useCarmenAvatarStyle", () => ({
  useCarmenAvatarStyle: () => ({
    style: state.style,
    setStyle: state.setStyle,
    saving: state.saving,
  }),
}));
vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isOwner: state.isOwner, isSuperAdmin: false }),
}));
vi.mock("@/components/carmen-profile/CarmenPortrait", () => ({
  CarmenPortrait: () => null,
}));

beforeEach(() => {
  state.style = "orbs";
  state.isOwner = true;
  state.saving = false;
  state.setStyle.mockReset();
});

describe("CarmenStylePicker", () => {
  test("is a named radio group with one Tab stop", () => {
    render(<CarmenStylePicker />);
    expect(
      screen.getByRole("radiogroup", { name: "סגנון כרמן" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /ספירות/ })).toHaveAttribute(
      "tabindex",
      "0",
    );
    expect(screen.getByRole("radio", { name: /כרמן/ })).toHaveAttribute(
      "tabindex",
      "-1",
    );
  });

  test("arrow keys select the next style", async () => {
    const user = userEvent.setup();
    render(<CarmenStylePicker />);
    screen.getByRole("radio", { name: /ספירות/ }).focus();
    await user.keyboard("{ArrowDown}");
    expect(state.setStyle).toHaveBeenCalledWith("character");
  });

  test("members who are not owners cannot change it", async () => {
    state.isOwner = false;
    const user = userEvent.setup();
    render(<CarmenStylePicker />);
    const character = screen.getByRole("radio", { name: /כרמן/ });
    expect(character).toBeDisabled();
    expect(screen.getByText(/רק בעלי הארגון/)).toBeInTheDocument();
    await user.click(character);
    expect(state.setStyle).not.toHaveBeenCalled();
  });

  test("keeps focus in the group while a save is pending", async () => {
    state.saving = true;
    const user = userEvent.setup();
    render(<CarmenStylePicker />);
    const orbs = screen.getByRole("radio", { name: /ספירות/ });
    orbs.focus();
    expect(orbs).toHaveFocus();
    expect(orbs).toHaveAttribute("aria-disabled", "true");
    await user.keyboard("{ArrowDown}");
    await user.click(screen.getByRole("radio", { name: /כרמן/ }));
    expect(state.setStyle).not.toHaveBeenCalled();
    expect(screen.getByRole("radiogroup")).toContainElement(
      document.activeElement as HTMLElement,
    );
  });
});
