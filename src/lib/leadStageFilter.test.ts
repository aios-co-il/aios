import { expect, test } from "vitest";
import {
  applyLeadStageQuery,
  applyResponseStatusFilter,
  includedStageIds,
  kanbanResponseStatuses,
  leadMatchesResponseStatusFilter,
  leadMatchesStageFilter,
  leadStageIdsFromPreset,
  leadStagePresetFields,
  NO_MATCHING_STAGE_ID,
  normalizeLeadStageIds,
  normalizeLeadValueFilterMode,
  stagesForKanbanQuery,
} from "./leadStageFilter.ts";

test("empty stage selection means every stage", () => {
  expect(normalizeLeadStageIds("all")).toStrictEqual([]);
  expect(normalizeLeadStageIds(undefined)).toStrictEqual([]);
  expect(normalizeLeadStageIds([])).toStrictEqual([]);
  expect(leadMatchesStageFilter("new", [])).toBe(true);
  expect(leadMatchesStageFilter(null, [])).toBe(true);
});

test("several stages match any of them", () => {
  expect(
    normalizeLeadStageIds([
      "proposal_sent",
      "negotiation",
      "proposal_sent",
      "all",
      "",
    ]),
  ).toStrictEqual(["proposal_sent", "negotiation"]);
  expect(
    leadMatchesStageFilter("negotiation", ["proposal_sent", "negotiation"]),
  ).toBe(true);
  expect(leadMatchesStageFilter("new", ["proposal_sent", "negotiation"])).toBe(
    false,
  );
});

test("legacy preset stageId still loads, and stageIds wins when both exist", () => {
  expect(leadStageIdsFromPreset({ stageId: "proposal_sent" })).toStrictEqual([
    "proposal_sent",
  ]);
  expect(leadStageIdsFromPreset({ stageId: "all" })).toStrictEqual([]);
  expect(
    leadStageIdsFromPreset({ stageIds: ["a", "b"], stageId: "all" }),
  ).toStrictEqual(["a", "b"]);
  expect(leadStageIdsFromPreset({ stageIds: [] })).toStrictEqual([]);
});

test("show keeps selected stages and hide drops them", () => {
  expect(leadMatchesStageFilter("new", ["new"], "show")).toBe(true);
  expect(leadMatchesStageFilter("contacted", ["new"], "show")).toBe(false);
  expect(leadMatchesStageFilter("new", ["new"], "hide")).toBe(false);
  expect(leadMatchesStageFilter("contacted", ["new"], "hide")).toBe(true);
  expect(leadMatchesStageFilter(null, ["new"], "hide")).toBe(true);
  expect(normalizeLeadValueFilterMode("hide")).toBe("hide");
  expect(normalizeLeadValueFilterMode("show")).toBe("show");
  expect(normalizeLeadValueFilterMode(undefined)).toBe("show");
  expect(normalizeLeadValueFilterMode("exclude")).toBe("show");
});

test("response status show and hide treat an empty status as none", () => {
  expect(
    leadMatchesResponseStatusFilter("new_lead", ["new_lead"], "show"),
  ).toBe(true);
  expect(
    leadMatchesResponseStatusFilter("in_progress", ["new_lead"], "show"),
  ).toBe(false);
  expect(
    leadMatchesResponseStatusFilter("not_relevant", ["not_relevant"], "hide"),
  ).toBe(false);
  expect(
    leadMatchesResponseStatusFilter("new_lead", ["not_relevant"], "hide"),
  ).toBe(true);
  expect(leadMatchesResponseStatusFilter(null, ["not_relevant"], "hide")).toBe(
    true,
  );
  expect(leadMatchesResponseStatusFilter("", ["not_relevant"], "hide")).toBe(
    true,
  );
  expect(leadMatchesResponseStatusFilter(null, ["none"], "show")).toBe(true);
  expect(leadMatchesResponseStatusFilter("new_lead", ["none"], "show")).toBe(
    false,
  );
  expect(leadMatchesResponseStatusFilter(null, ["not_relevant"], "show")).toBe(
    false,
  );
  expect(leadMatchesResponseStatusFilter("new_lead", [], "hide")).toBe(true);
});

test("hide stage ids become the complement, and an empty complement matches nothing", () => {
  const all = ["new", "contacted", "meeting_scheduled"];
  expect(includedStageIds([], all, "hide")).toBe(null);
  expect(includedStageIds(["new"], all, "show")).toStrictEqual(["new"]);
  expect(includedStageIds(["new"], all, "hide")).toStrictEqual([
    "contacted",
    "meeting_scheduled",
  ]);
  expect(includedStageIds(all, all, "hide")).toStrictEqual([]);
  expect(stagesForKanbanQuery([], all, "show")).toStrictEqual(all);
  expect(stagesForKanbanQuery(all, all, "hide")).toStrictEqual([
    NO_MATCHING_STAGE_ID,
  ]);
  expect(kanbanResponseStatuses(["not_relevant"], "show")).toStrictEqual([
    "not_relevant",
  ]);
  expect(kanbanResponseStatuses(["not_relevant"], "hide")).toBe(null);
  expect(kanbanResponseStatuses(["none"], "show")).toBe(null);
});

test("stage and response queries encode show and hide", () => {
  const calls: Array<[string, ...unknown[]]> = [];
  const query = {
    in(column: string, values: string[]) {
      calls.push(["in", column, values]);
      return query;
    },
    is(column: string, value: null) {
      calls.push(["is", column, value]);
      return query;
    },
    not(column: string, operator: string, value: unknown) {
      calls.push(["not", column, operator, value]);
      return query;
    },
    or(filter: string) {
      calls.push(["or", filter]);
      return query;
    },
  };

  applyLeadStageQuery(query, ["new"], "show");
  applyLeadStageQuery(query, ["new"], "hide", ["new", "contacted"]);
  applyLeadStageQuery(query, ["new", "contacted"], "hide", [
    "new",
    "contacted",
  ]);
  applyResponseStatusFilter(query, ["not_relevant"], "hide");
  applyResponseStatusFilter(query, ["none"], "hide");
  applyResponseStatusFilter(query, ["none", "not_relevant"], "hide");
  applyResponseStatusFilter(query, ["new_lead"], "show");
  applyResponseStatusFilter(query, ["none"], "show");
  applyResponseStatusFilter(query, ["none", "new_lead"], "show");

  expect(calls).toStrictEqual([
    ["in", "status", ["new"]],
    ["in", "status", ["contacted"]],
    ["in", "status", [NO_MATCHING_STAGE_ID]],
    ["or", "response_status.is.null,response_status.not.in.(not_relevant)"],
    ["not", "response_status", "is", null],
    ["not", "response_status", "is", null],
    ["not", "response_status", "in", "(not_relevant)"],
    ["in", "response_status", ["new_lead"]],
    ["is", "response_status", null],
  ]);
});

test("saved presets keep a single stage readable by older clients", () => {
  expect(leadStagePresetFields(["proposal_sent"])).toStrictEqual({
    stageIds: ["proposal_sent"],
    stageId: "proposal_sent",
  });
  expect(leadStagePresetFields(["a", "b"])).toStrictEqual({
    stageIds: ["a", "b"],
    stageId: "all",
  });
  expect(leadStagePresetFields([])).toStrictEqual({
    stageIds: [],
    stageId: "all",
  });
});
