import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PulseTarget } from "../../../../supabase/functions/_shared/pulse/targets/kinds.ts";
import { TargetRow } from "./TargetRow";

const approvedCpl: PulseTarget = {
  value: 60,
  kind: "cpl",
  direction: "maximum",
  source: "approved",
  scope: "campaign",
  rationale: null,
  set_at: null,
  set_by: null,
};

describe("TargetRow", () => {
  it("clears its own target when the value is emptied", () => {
    const onSave = vi.fn();
    render(
      <TargetRow
        title="לידים"
        goal="leads"
        target={approvedCpl}
        inherited={null}
        saving={false}
        onSave={onSave}
      />,
    );
    fireEvent.change(screen.getByDisplayValue("60"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "הסר יעד" }));
    expect(onSave).toHaveBeenCalledWith("cpl", null);
  });

  it("refuses a value that is not a positive number", () => {
    render(
      <TargetRow
        title="לידים"
        goal="leads"
        target={null}
        inherited={null}
        saving={false}
        onSave={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("לדוגמה: 90"), {
      target: { value: "-5" },
    });
    expect(screen.getByRole("button", { name: "שמור יעד" })).toBeDisabled();
  });
});
