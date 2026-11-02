import { describe, expect, it } from "vitest";
import { opensOnNewLeads, parseLeadStageScope } from "./leadStageScope";

describe("parseLeadStageScope", () => {
  it("accepts all or new and nothing else", () => {
    expect(parseLeadStageScope("all")).toBe("all");
    expect(parseLeadStageScope("new")).toBe("new");
    expect(parseLeadStageScope("kanban")).toBeNull();
    expect(parseLeadStageScope(null)).toBeNull();
    expect(parseLeadStageScope(undefined)).toBeNull();
  });
});

describe("opensOnNewLeads", () => {
  it("follows a saved scope in every view", () => {
    for (const view of ["kanban", "table", "chat"] as const) {
      expect(opensOnNewLeads("new", view)).toBe(true);
      expect(opensOnNewLeads("all", view)).toBe(false);
    }
  });

  it("opens only chat on new leads when nothing is saved", () => {
    expect(opensOnNewLeads(null, "chat")).toBe(true);
    expect(opensOnNewLeads(null, "table")).toBe(false);
    expect(opensOnNewLeads(null, "kanban")).toBe(false);
  });
});
