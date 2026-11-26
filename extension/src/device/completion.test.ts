import { describe, expect, it } from "vitest";
import { parseReport } from "../../../supabase/functions/carmen-device-action/report.ts";
import { toolResult } from "../../../supabase/functions/carmen-device-action/result.ts";
import { completeBody, type ReadOutcome } from "./completion.ts";

const ID = "0b5e8f7a-3c1d-4e2f-9a8b-7c6d5e4f3a2b";
const LOCATION = { origin: "https://shop.example", path: "/items" };
const SNAPSHOT = {
  ...LOCATION,
  snapshot_id: "s",
  title: "t",
  elements: [],
  text: "x",
};

/** The body as the function's parser reads it; null when the function would answer 400. */
function serverReading(outcome: ReadOutcome) {
  return parseReport({ ...completeBody(ID, outcome) });
}

describe("completeBody", () => {
  it("reports a read without a card as done and free, with the result and where it was read", () => {
    const body = completeBody(ID, {
      status: "done",
      asked: false,
      result: SNAPSHOT,
    });

    expect(body).toEqual({
      action: "complete",
      trust_origin: null,
      id: ID,
      status: "done",
      decision: "free",
      observed: LOCATION,
      result: SNAPSHOT,
    });
    expect(
      serverReading({ status: "done", asked: false, result: SNAPSHOT }),
    ).not.toBeNull();
    expect(toolResult("browser_read_page", body.result, "")).not.toBeNull();
  });

  it("reports a read after the card as done and ask", () => {
    expect(
      completeBody(ID, { status: "done", asked: true, result: SNAPSHOT })
        .decision,
    ).toBe("ask");
  });

  it("reports a declined card as denied and ask, with no result", () => {
    const outcome: ReadOutcome = { status: "denied", observed: LOCATION };

    expect(completeBody(ID, outcome)).toMatchObject({
      status: "denied",
      decision: "ask",
      result: null,
    });
    expect(serverReading(outcome)).not.toBeNull();
  });

  it("reports a refusal as never, with no address and no result", () => {
    expect(completeBody(ID, { status: "refused" })).toMatchObject({
      status: "refused",
      decision: "never",
      observed: null,
      result: null,
    });
    expect(serverReading({ status: "refused" })).not.toBeNull();
  });

  it("reports a stopped or changed step with the rule applied so far and no result", () => {
    const outcomes: Array<ReadOutcome> = [
      { status: "cancelled", decision: null, observed: null },
      { status: "cancelled", decision: "ask", observed: LOCATION },
      { status: "expired", decision: "ask", observed: LOCATION },
      { status: "target_changed", decision: "free", observed: LOCATION },
    ];

    for (const outcome of outcomes) {
      expect(completeBody(ID, outcome).result).toBeNull();
      expect(serverReading(outcome)).not.toBeNull();
    }
  });
});
