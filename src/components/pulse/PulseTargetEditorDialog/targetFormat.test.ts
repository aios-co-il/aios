import { describe, expect, it } from "vitest";
import type { PulseTarget } from "../../../../supabase/functions/_shared/pulse/targets/kinds.ts";
import { inheritedFrom, parseDraft } from "./targetFormat";

const target: Omit<PulseTarget, "scope"> = {
  value: 60,
  kind: "cpl",
  direction: "maximum",
  source: "approved",
  rationale: null,
  set_at: null,
  set_by: null,
};

describe("parseDraft", () => {
  it("reads a positive number, with a comma as the decimal point", () => {
    expect(parseDraft(" 2,5 ")).toBe(2.5);
    expect(parseDraft("")).toBeNull();
    expect(parseDraft("0")).toBe("invalid");
    expect(parseDraft("abc")).toBe("invalid");
  });
});

describe("inheritedFrom", () => {
  it("names where a target that is not the row's own comes from", () => {
    expect(inheritedFrom({ ...target, scope: "campaign" }, "campaign")).toBe(
      null,
    );
    expect(inheritedFrom({ ...target, scope: "platform" }, "campaign")).toBe(
      "מהפלטפורמה",
    );
    expect(inheritedFrom({ ...target, scope: "table" }, "platform")).toBe(
      "מהגדרות הדוח",
    );
    expect(inheritedFrom(null, "campaign")).toBe(null);
  });
});
