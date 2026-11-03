import { describe, expect, it } from "vitest";
import {
  decideOpeningStage,
  opensOnNewLeads,
  parseLeadStageScope,
} from "./leadStageScope";

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

describe("decideOpeningStage", () => {
  const base = {
    savedScope: "new" as const,
    viewMode: "table" as const,
    userChoseFilter: false,
    firstStageKey: "new",
  };

  it("applies the first stage when the screen opens on new leads", () => {
    expect(decideOpeningStage(base)).toEqual({
      kind: "apply",
      stageKey: "new",
    });
  });

  it("leaves a chosen filter or a scope of all alone", () => {
    expect(decideOpeningStage({ ...base, userChoseFilter: true })).toEqual({
      kind: "leave",
    });
    expect(decideOpeningStage({ ...base, savedScope: "all" })).toEqual({
      kind: "leave",
    });
  });

  it("waits for the pipeline stages", () => {
    expect(decideOpeningStage({ ...base, firstStageKey: undefined })).toEqual({
      kind: "wait",
    });
  });
});
