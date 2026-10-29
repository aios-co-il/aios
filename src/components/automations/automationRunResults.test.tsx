import { describe, expect, it } from "vitest";
import {
  parseFacebookPreviewLeads,
  parseFlowStepResults,
} from "./automationRunResults";

describe("parseFlowStepResults", () => {
  it("returns an empty list for non-array input", () => {
    expect(parseFlowStepResults(undefined)).toEqual([]);
    expect(parseFlowStepResults({ steps: [] })).toEqual([]);
  });

  it("keeps string fields, coerces success to boolean and skips non-objects", () => {
    const steps = parseFlowStepResults([
      {
        action_type: "agent",
        success: 1,
        error: "boom",
        response: { output: "hi" },
      },
      "garbage",
      { action_type: 5, error: { nested: true }, response: "x" },
    ]);
    expect(steps).toEqual([
      {
        step_id: undefined,
        action_type: "agent",
        step_type: undefined,
        success: true,
        error: "boom",
        response: { output: "hi" },
      },
      {
        step_id: undefined,
        action_type: undefined,
        step_type: undefined,
        success: false,
        error: undefined,
        response: undefined,
      },
    ]);
  });
});

describe("parseFacebookPreviewLeads", () => {
  it("keeps well-formed leads and only string field values", () => {
    expect(
      parseFacebookPreviewLeads([
        {
          leadgen_id: "l1",
          form_id: "f1",
          created_time: "2026-01-01T00:00:00Z",
          field_data: { email: "a@b.c", age: 3 },
        },
        { leadgen_id: "l2", form_id: "f2" },
        null,
      ]),
    ).toEqual([
      {
        leadgen_id: "l1",
        form_id: "f1",
        created_time: "2026-01-01T00:00:00Z",
        field_data: { email: "a@b.c" },
      },
    ]);
  });

  it("returns an empty list for non-array input", () => {
    expect(parseFacebookPreviewLeads({ leads: [] })).toEqual([]);
  });
});
