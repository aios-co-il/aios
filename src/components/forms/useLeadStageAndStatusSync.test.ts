import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  useLeadStageAndStatusSync,
  type LeadStageAndStatus,
} from "./useLeadStageAndStatusSync";

/** Renders the hook for a lead and returns the spy and a way to change the lead. */
function renderSync(initial: LeadStageAndStatus) {
  const onOutsideChange = vi.fn();
  const { rerender } = renderHook(
    (lead: LeadStageAndStatus) =>
      useLeadStageAndStatusSync(lead, onOutsideChange),
    { initialProps: initial },
  );

  return { onOutsideChange, rerender };
}

describe("useLeadStageAndStatusSync", () => {
  it("does not report the values the form opened with", () => {
    const { onOutsideChange, rerender } = renderSync({
      status: "new",
      response_status: null,
    });

    rerender({ status: "new", response_status: null });

    expect(onOutsideChange).not.toHaveBeenCalled();
  });

  it("reports a stage changed outside the form, once", () => {
    const { onOutsideChange, rerender } = renderSync({
      status: "new",
      response_status: "no_answer",
    });

    rerender({ status: "contacted", response_status: "no_answer" });
    rerender({ status: "contacted", response_status: "no_answer" });

    expect(onOutsideChange).toHaveBeenCalledTimes(1);
    expect(onOutsideChange).toHaveBeenCalledWith({
      status: "contacted",
      response_status: "no_answer",
    });
  });

  it("reports a response status that was cleared", () => {
    const { onOutsideChange, rerender } = renderSync({
      status: "new",
      response_status: "no_answer",
    });

    rerender({ status: "new", response_status: null });

    expect(onOutsideChange).toHaveBeenCalledWith({
      status: "new",
      response_status: null,
    });
  });
});
