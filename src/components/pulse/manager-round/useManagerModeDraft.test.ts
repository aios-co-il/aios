import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PULSE_ALERT_RULES } from "@/lib/pulseAlertRules";
import { useManagerModeDraft } from "./useManagerModeDraft";

const owner = vi.hoisted(() => ({ value: false, calls: [] as unknown[] }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (fn: string, args: unknown) => {
      owner.calls.push([fn, args]);
      return Promise.resolve({ data: owner.value, error: null });
    },
  },
}));
vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: "t1" }),
}));

/** The hook for a viewer the database does (or does not) treat as an owner, over the stored rules `value`; returns its onSave spy too. */
function renderDraft(value: unknown, isOwner = false) {
  owner.value = isOwner;
  owner.calls = [];
  const onSave = vi.fn();
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  const hook = renderHook(
    ({ open, stored }) => useManagerModeDraft(open, stored, onSave),
    { initialProps: { open: true, stored: value }, wrapper },
  );
  return { ...hook, onSave };
}

describe("useManagerModeDraft", () => {
  it("asks the database whether the viewer owns the tenant", async () => {
    const { result } = renderDraft({}, true);
    await waitFor(() => expect(result.current.section).not.toBeNull());
    expect(owner.calls).toEqual([
      ["carmen_manager_is_owner", { p_tenant_id: "t1" }],
    ]);
  });

  it("starts from the stored mode on each open", async () => {
    const { result, rerender } = renderDraft(
      { manager: { mode: "david_only" } },
      true,
    );
    await waitFor(() => expect(result.current.section).not.toBeNull());
    expect(result.current.section?.mode).toBe("david_only");
    act(() => result.current.section?.onChange("team"));
    expect(result.current.section?.mode).toBe("team");
    rerender({ open: false, stored: { manager: { mode: "david_only" } } });
    rerender({ open: true, stored: { manager: { mode: "david_only" } } });
    expect(result.current.section?.mode).toBe("david_only");
  });

  it("saves the chosen mode next to the rules for an owner", async () => {
    const { result, onSave } = renderDraft({}, true);
    await waitFor(() => expect(result.current.section).not.toBeNull());
    expect(result.current.section?.mode).toBe("observe");
    act(() => result.current.section?.onChange("team"));
    result.current.save(DEFAULT_PULSE_ALERT_RULES);
    expect(onSave).toHaveBeenCalledWith(DEFAULT_PULSE_ALERT_RULES, {
      mode: "team",
      card_log_system_sends: false,
    });
  });

  it("shows no section to others, whose save sends no manager change", async () => {
    const { result, onSave } = renderDraft({ manager: { mode: "team" } });
    await waitFor(() => expect(owner.calls).toHaveLength(1));
    expect(result.current.section).toBeNull();
    expect(result.current.cardLog).toBeNull();
    result.current.save(DEFAULT_PULSE_ALERT_RULES);
    expect(onSave).toHaveBeenCalledWith(DEFAULT_PULSE_ALERT_RULES, {});
  });
});
