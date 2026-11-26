/**
 * A fake device for the click and type tests: the read's fake (readActions.test-fixture.ts)
 * with a claim for the tool, an acting function whose answers a test can replace, and a
 * record of every run after the tap.
 */
import { vi } from "vitest";
import type { PageActRequest } from "./keptSnapshot.ts";
import type { ClaimAnswer } from "./readActions.ts";
import { fakeDevice } from "./readActions.test-fixture.ts";

export const TYPE_ARGS = {
  snapshot_id: "snapshot-1",
  ref: "e2",
  text: "Dana Levi",
};

/** The target the fake acting function describes before the card: a text field named Name. */
export const TEXT_FIELD_TARGET = {
  role: "textbox",
  name: "Name",
  field: { type: "text", autocomplete: null, names: ["name", "Name"] },
  textEntry: true,
  destination: null,
  pageFields: [{ type: "text", autocomplete: null, names: ["name"] }],
  fingerprint: "fp-1",
};

/** A fake device whose claim hands over this tool with these arguments. */
export function actingDevice(
  tool: "browser_click" | "browser_type" = "browser_type",
  args: unknown = TYPE_ARGS,
) {
  let inspected: unknown = { kind: "target", target: TEXT_FIELD_TARGET };
  const acted: Array<{ documentId: string; request: PageActRequest }> = [];
  const device = fakeDevice({
    claim: vi.fn(async (): Promise<ClaimAnswer> => ({
      ok: true,
      tool,
      arguments: args,
    })),
    inspectTarget: vi.fn(async () => ({
      documentId: "doc-1",
      answer: inspected,
    })),
    actOnTarget: vi.fn(
      async (_tabId: number, documentId: string, request: PageActRequest) => {
        acted.push({ documentId, request });
        return { kind: "acted" };
      },
    ),
  });

  return {
    ...device,
    /** The acting function's runs after the tap: the document and the request. */
    acted,
    /** What the acting function answers before the card, from now on. */
    setInspected: (answer: unknown) => {
      inspected = answer;
    },
  };
}
