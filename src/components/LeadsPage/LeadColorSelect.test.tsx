import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LeadColorSelect } from "./LeadColorSelect";

const options = [
  { value: "new", label: "ליד חדש", color: "#2563eb" },
  { value: "won", label: "נסגר", color: "#16a34a" },
];

function renderSelect() {
  render(
    <LeadColorSelect
      value="new"
      options={options}
      current={{ label: "ליד חדש", color: "#2563eb" }}
      placeholder="בחר שלב"
      onValueChange={vi.fn()}
      manageLabel="ניהול שלבי משפך"
      onManage={vi.fn()}
    />,
  );
}

describe("LeadColorSelect", () => {
  it("fills the chip with the colour the tenant chose", () => {
    renderSelect();
    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveStyle({
      backgroundColor: "#2563eb",
      color: "#fff",
    });
  });

  it("fills each option with its own chosen colour", async () => {
    const user = userEvent.setup();
    renderSelect();
    await user.click(screen.getByRole("combobox"));
    expect(screen.getByRole("option", { name: "נסגר" })).toHaveStyle({
      backgroundColor: "#16a34a",
      color: "#fff",
    });
  });
});
