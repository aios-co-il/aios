import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mergePersonas } from "./carmenPersonas";
import { PersonaSwitcher } from "./PersonaSwitcher";

const state = vi.hoisted(() => ({
  activeKey: null as string | null,
  loaded: true,
  choose: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("./useCarmenPersonas", () => ({
  useCarmenPersonas: () => ({
    personas: mergePersonas([]),
    loaded: state.loaded,
    activeKey: state.activeKey,
    choose: state.choose,
    save: state.save,
    remove: state.remove,
    busy: false,
  }),
}));
vi.mock("@/hooks/useCarmenIdentity", () => ({
  useCarmenIdentity: () => ({ image: "carmen.png", custom: false }),
}));
vi.mock("@/components/carmen/MiniMe/MiniMeGenderPicker", () => ({
  MiniMeGenderPicker: () => <div>gender picker</div>,
}));

describe("PersonaSwitcher", () => {
  beforeEach(() => {
    state.activeKey = null;
    state.loaded = true;
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
    await user.type(screen.getByLabelText(/^שם/), "ג׳ארוויס");
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

  it("moves the pick with the arrow keys", async () => {
    state.activeKey = "carmen";
    const user = userEvent.setup();
    render(<PersonaSwitcher />);
    screen.getByRole("radio", { name: /כרמן/ }).focus();
    await user.keyboard("{ArrowDown}");
    expect(state.choose).toHaveBeenCalledWith("minime");
  });

  it("does not open an editor before the stored characters load", () => {
    state.loaded = false;
    render(<PersonaSwitcher />);
    expect(
      screen.getByRole("button", { name: /עריכת מיני מי/ }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: /דמות חדשה/ })).toBeDisabled();
  });

  it("keeps a newer editor open when an earlier save finishes", async () => {
    const user = userEvent.setup();
    render(<PersonaSwitcher />);
    await user.click(screen.getByRole("button", { name: /עריכת כרמן/ }));
    await user.click(screen.getByRole("button", { name: "שמירה" }));
    const { onSuccess } = state.save.mock.calls[0][1];
    await user.click(screen.getByRole("button", { name: /עריכת AIOS/ }));
    act(() => onSuccess());
    expect(screen.getByText("עריכת AIOS")).toBeInTheDocument();
  });
});
