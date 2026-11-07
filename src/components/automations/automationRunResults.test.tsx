import { describe, expect, it } from "vitest";
import {
  firstFlowRunResponse,
  parseFacebookPreviewLeads,
  parseFlowRunResponse,
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

describe("parseFlowRunResponse", () => {
  it("reads flow, agent output and steps; steps stay unset when not a list", () => {
    expect(
      parseFlowRunResponse({
        flow: true,
        agent_output: "done",
        steps: [{ action_type: "agent", success: true }],
      }),
    ).toMatchObject({
      flow: true,
      agent_output: "done",
      steps: [{ action_type: "agent", success: true }],
    });
    expect(parseFlowRunResponse({ output: 3, steps: "x" })).toMatchObject({
      output: "3",
      steps: undefined,
    });
    expect(parseFlowRunResponse("nope")).toBeUndefined();
  });
});

describe("firstFlowRunResponse", () => {
  it("unwraps results[0].response, else uses results[0] itself", () => {
    expect(
      firstFlowRunResponse({
        results: [{ response: { flow: true, agent_output: "a" } }],
      }),
    ).toMatchObject({ flow: true, agent_output: "a" });
    expect(
      firstFlowRunResponse({ results: [{ output: "plain" }] }),
    ).toMatchObject({ output: "plain" });
    expect(firstFlowRunResponse({ results: "x" })).toBeUndefined();
    expect(firstFlowRunResponse(null)).toBeUndefined();
  });
});
