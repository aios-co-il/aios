import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemberPermissionsCard } from "./MemberPermissionsCard";
import type { AccessRow } from "./types";

const MEMBER = { id: "u1", full_name: "Dana" };
const ROW: AccessRow = {
  id: "r1",
  user_id: "u1",
  enabled: true,
  brain_access: null,
  dev_escalation_tier: null,
  sensitive_screenshots: false,
};

/** The card for Dana with this row; the saves it asked for. */
function cardWith(row: AccessRow | undefined, disabled = false) {
  const onSave = vi.fn();
  render(
    <MemberPermissionsCard
      member={MEMBER}
      row={row}
      routes={[]}
      disabled={disabled}
      onSave={onSave}
    />,
  );
  return {
    onSave,
    sensitive: screen.getByRole("switch", { name: "צילום דפים רגישים" }),
  };
}

describe("MemberPermissionsCard: pictures of sensitive pages", () => {
  it("is off for a member without a row, and switching it on saves only that", async () => {
    const user = userEvent.setup();
    const { onSave, sensitive } = cardWith(undefined);

    expect(sensitive).toHaveAttribute("aria-checked", "false");

    await user.click(sensitive);

    expect(onSave).toHaveBeenCalledWith({ sensitive_screenshots: true });
  });

  it("shows the stored switch and turns it off again", async () => {
    const user = userEvent.setup();
    const { onSave, sensitive } = cardWith({
      ...ROW,
      sensitive_screenshots: true,
    });

    expect(sensitive).toHaveAttribute("aria-checked", "true");

    await user.click(sensitive);

    expect(onSave).toHaveBeenCalledWith({ sensitive_screenshots: false });
  });

  it("cannot be changed by someone who is not a manager", () => {
    const { sensitive } = cardWith(ROW, true);

    expect(sensitive).toBeDisabled();
  });
});
