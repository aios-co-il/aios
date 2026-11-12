import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mergePersonas } from "./carmenPersonas";
import { PersonaSwitcher } from "./PersonaSwitcher";

const state = vi.hoisted(() => ({
  activeKey: null as string | null,
  choose: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("./useCarmenPersonas", () => ({
  useCarmenPersonas: () => ({
    personas: mergePersonas([]),
    activeKey: state.activeKey,
    choose: state.choose,
    save: state.save,
    remove: state.remove,
    busy: false,
  }),
}));
vi.mock("@/components/carmen/MiniMe/MiniMeGenderPicker", () => ({
  MiniMeGenderPicker: () => <div>gender picker</div>,
}));

describe("PersonaSwitcher", () => {
  beforeEach(() => {
    state.activeKey = null;
    vi.clearAllMocks();
  });

  it("offers Carmen, Mini Me and AIOS and picks one", async () => {
    const user = userEvent.setup();
    render(<PersonaSwitcher />);
    expect(screen.getAllByRole("radio", { checked: false })).toHaveLength(3);
    await user.click(screen.getByRole("radio", { name: /מיני מי/ }));
    expect(state.choose).toHaveBeenCalledWith("minime");
  });

  it("marks the picked character", () => {
    state.activeKey = "aios";
    render(<PersonaSwitcher />);
    expect(screen.getByRole("radio", { name: /AIOS/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("creates a character for the user only by default, with its call words", async () => {
    const user = userEvent.setup();
    render(<PersonaSwitcher />);
    await user.click(screen.getByRole("button", { name: /דמות חדשה/ }));
    await user.type(screen.getByLabelText("שם"), "ג׳ארוויס");
    await user.type(screen.getByLabelText(/מילות הפעלה/), "ג׳ארוויס, ג׳רוויס");
    await user.click(screen.getByRole("button", { name: "שמירה" }));
    expect(state.save).toHaveBeenCalledWith(
      expect.objectContaining({
        persona: null,
        audience: "me",
        draft: expect.objectContaining({
          displayName: "ג׳ארוויס",
          callWords: ["ג׳ארוויס", "ג׳רוויס"],
        }),
      }),
      expect.anything(),
    );
  });
});
