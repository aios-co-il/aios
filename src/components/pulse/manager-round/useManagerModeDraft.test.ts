import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PULSE_ALERT_RULES } from "@/lib/pulseAlertRules";
import { useManagerModeDraft } from "./useManagerModeDraft";

const role = vi.hoisted(() => ({
  isOwner: false,
  isAgencyOwner: false,
  isSuperAdmin: false,
}));
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => role }));

/** The hook for a viewer with these roles over the stored rules `value`; returns its onSave spy too. */
function renderDraft(value: unknown, roles: Partial<typeof role> = {}) {
  Object.assign(role, {
    isOwner: false,
    isAgencyOwner: false,
    isSuperAdmin: false,
    ...roles,
  });
  const onSave = vi.fn();
  const hook = renderHook(
    ({ open, stored }) => useManagerModeDraft(open, stored, onSave),
    { initialProps: { open: true, stored: value } },
  );
  return { ...hook, onSave };
}

describe("useManagerModeDraft", () => {
  it("starts from the stored mode on each open", () => {
    const { result, rerender } = renderDraft(
      { manager: { mode: "david_only" } },
      { isOwner: true },
    );
    expect(result.current.section?.mode).toBe("david_only");
    act(() => result.current.section?.onChange("team"));
    expect(result.current.section?.mode).toBe("team");
    rerender({ open: false, stored: { manager: { mode: "david_only" } } });
    rerender({ open: true, stored: { manager: { mode: "david_only" } } });
    expect(result.current.section?.mode).toBe("david_only");
  });

  it("saves the chosen mode next to the rules for an owner", () => {
    const { result, onSave } = renderDraft({}, { isOwner: true });
    expect(result.current.section?.mode).toBe("observe");
    act(() => result.current.section?.onChange("team"));
    result.current.save(DEFAULT_PULSE_ALERT_RULES);
    expect(onSave).toHaveBeenCalledWith(DEFAULT_PULSE_ALERT_RULES, {
      mode: "team",
    });
  });

  it("lets agency owners and super admins change the mode too", () => {
    for (const roles of [{ isAgencyOwner: true }, { isSuperAdmin: true }]) {
      const { result } = renderDraft({ manager: { mode: "team" } }, roles);
      expect(result.current.section?.mode).toBe("team");
    }
  });

  it("shows no section to others, whose save sends no manager change", () => {
    const { result, onSave } = renderDraft({ manager: { mode: "team" } });
    expect(result.current.section).toBeNull();
    result.current.save(DEFAULT_PULSE_ALERT_RULES);
    expect(onSave).toHaveBeenCalledWith(DEFAULT_PULSE_ALERT_RULES, {});
  });
});
