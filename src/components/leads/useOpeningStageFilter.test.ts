import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LeadViewMode } from "@/lib/leadViewMode";
import type { LeadStageScope } from "./leadStageScope";
import { useOpeningStageFilter } from "./useOpeningStageFilter";

type Props = {
  tenantId: string;
  viewMode: LeadViewMode;
  savedScope: LeadStageScope | null;
  isSettled: boolean;
  hasFilterOrPreset: boolean;
  firstStageKey: string | undefined;
};

const opening: Props = {
  tenantId: "tenant-dmm",
  viewMode: "table",
  savedScope: "new",
  isSettled: true,
  hasFilterOrPreset: false,
  firstStageKey: "new",
};

/** Renders the hook with a spy standing in for the stage filter setter. */
function renderOpening(initial: Partial<Props> = {}) {
  const applyStage = vi.fn();
  const hook = renderHook(
    (props: Props) => useOpeningStageFilter({ ...props, applyStage }),
    { initialProps: { ...opening, ...initial } },
  );
  return { ...hook, applyStage };
}

describe("useOpeningStageFilter", () => {
  it("opens on the first stage when the saved scope is new", () => {
    const { applyStage } = renderOpening();
    expect(applyStage).toHaveBeenCalledExactlyOnceWith("new");
  });

  it("saved new, clear filters, stays cleared", () => {
    const { applyStage, rerender } = renderOpening();
    rerender({ ...opening, hasFilterOrPreset: true });
    rerender({ ...opening, hasFilterOrPreset: false });
    expect(applyStage).toHaveBeenCalledOnce();
  });

  it("waits for the saved default and the pipeline stages", () => {
    const { applyStage, rerender } = renderOpening({
      isSettled: false,
      firstStageKey: undefined,
    });
    rerender({ ...opening, firstStageKey: undefined });
    expect(applyStage).not.toHaveBeenCalled();
    rerender(opening);
    expect(applyStage).toHaveBeenCalledExactlyOnceWith("new");
  });

  it("applies again in another view or tenant", () => {
    const { applyStage, rerender } = renderOpening();
    rerender({ ...opening, viewMode: "kanban" });
    rerender({ ...opening, viewMode: "kanban", tenantId: "tenant-other" });
    expect(applyStage).toHaveBeenCalledTimes(3);
  });

  it("keeps a stage the user picked when the view changes", () => {
    const { applyStage, rerender, result } = renderOpening();
    act(() => result.current.markUserChoice());
    rerender({ ...opening, viewMode: "kanban" });
    expect(applyStage).toHaveBeenCalledOnce();
  });

  it("re-opens chat on new leads when nothing is saved", () => {
    const { applyStage, rerender, result } = renderOpening({
      savedScope: null,
      viewMode: "chat",
    });
    act(() => result.current.markUserChoice());
    rerender({ ...opening, savedScope: null, viewMode: "table" });
    rerender({ ...opening, savedScope: null, viewMode: "chat" });
    expect(applyStage).toHaveBeenCalledTimes(2);
  });

  it("leaves a filter or preset the screen opened with", () => {
    const { applyStage } = renderOpening({ hasFilterOrPreset: true });
    expect(applyStage).not.toHaveBeenCalled();
  });
});
