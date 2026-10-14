import assert from "node:assert/strict";
import test from "node:test";
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
  assert.deepEqual(normalizeLeadStageIds("all"), []);
  assert.deepEqual(normalizeLeadStageIds(undefined), []);
  assert.deepEqual(normalizeLeadStageIds([]), []);
  assert.equal(leadMatchesStageFilter("new", []), true);
  assert.equal(leadMatchesStageFilter(null, []), true);
});

test("several stages match any of them", () => {
  assert.deepEqual(
    normalizeLeadStageIds([
      "proposal_sent",
      "negotiation",
      "proposal_sent",
      "all",
      "",
    ]),
    ["proposal_sent", "negotiation"],
  );
  assert.equal(
    leadMatchesStageFilter("negotiation", ["proposal_sent", "negotiation"]),
    true,
  );
  assert.equal(
    leadMatchesStageFilter("new", ["proposal_sent", "negotiation"]),
    false,
  );
});

test("legacy preset stageId still loads, and stageIds wins when both exist", () => {
  assert.deepEqual(leadStageIdsFromPreset({ stageId: "proposal_sent" }), [
    "proposal_sent",
  ]);
  assert.deepEqual(leadStageIdsFromPreset({ stageId: "all" }), []);
  assert.deepEqual(
    leadStageIdsFromPreset({ stageIds: ["a", "b"], stageId: "all" }),
    ["a", "b"],
  );
  assert.deepEqual(leadStageIdsFromPreset({ stageIds: [] }), []);
});

test("show keeps selected stages and hide drops them", () => {
  assert.equal(leadMatchesStageFilter("new", ["new"], "show"), true);
  assert.equal(leadMatchesStageFilter("contacted", ["new"], "show"), false);
  assert.equal(leadMatchesStageFilter("new", ["new"], "hide"), false);
  assert.equal(leadMatchesStageFilter("contacted", ["new"], "hide"), true);
  assert.equal(leadMatchesStageFilter(null, ["new"], "hide"), true);
  assert.equal(normalizeLeadValueFilterMode("hide"), "hide");
  assert.equal(normalizeLeadValueFilterMode("show"), "show");
  assert.equal(normalizeLeadValueFilterMode(undefined), "show");
  assert.equal(normalizeLeadValueFilterMode("exclude"), "show");
});

test("response status show and hide treat an empty status as none", () => {
  assert.equal(
    leadMatchesResponseStatusFilter("new_lead", ["new_lead"], "show"),
    true,
  );
  assert.equal(
    leadMatchesResponseStatusFilter("in_progress", ["new_lead"], "show"),
    false,
  );
  assert.equal(
    leadMatchesResponseStatusFilter("not_relevant", ["not_relevant"], "hide"),
    false,
  );
  assert.equal(
    leadMatchesResponseStatusFilter("new_lead", ["not_relevant"], "hide"),
    true,
  );
  assert.equal(
    leadMatchesResponseStatusFilter(null, ["not_relevant"], "hide"),
    true,
  );
  assert.equal(
    leadMatchesResponseStatusFilter("", ["not_relevant"], "hide"),
    true,
  );
  assert.equal(leadMatchesResponseStatusFilter(null, ["none"], "show"), true);
  assert.equal(
    leadMatchesResponseStatusFilter("new_lead", ["none"], "show"),
    false,
  );
  assert.equal(
    leadMatchesResponseStatusFilter(null, ["not_relevant"], "show"),
    false,
  );
  assert.equal(leadMatchesResponseStatusFilter("new_lead", [], "hide"), true);
});

test("hide stage ids become the complement, and an empty complement matches nothing", () => {
  const all = ["new", "contacted", "meeting_scheduled"];
  assert.equal(includedStageIds([], all, "hide"), null);
  assert.deepEqual(includedStageIds(["new"], all, "show"), ["new"]);
  assert.deepEqual(includedStageIds(["new"], all, "hide"), [
    "contacted",
    "meeting_scheduled",
  ]);
  assert.deepEqual(includedStageIds(all, all, "hide"), []);
  assert.deepEqual(stagesForKanbanQuery([], all, "show"), all);
  assert.deepEqual(stagesForKanbanQuery(all, all, "hide"), [
    NO_MATCHING_STAGE_ID,
  ]);
  assert.deepEqual(kanbanResponseStatuses(["not_relevant"], "show"), [
    "not_relevant",
  ]);
  assert.equal(kanbanResponseStatuses(["not_relevant"], "hide"), null);
  assert.equal(kanbanResponseStatuses(["none"], "show"), null);
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

  assert.deepEqual(calls, [
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
  assert.deepEqual(leadStagePresetFields(["proposal_sent"]), {
    stageIds: ["proposal_sent"],
    stageId: "proposal_sent",
  });
  assert.deepEqual(leadStagePresetFields(["a", "b"]), {
    stageIds: ["a", "b"],
    stageId: "all",
  });
  assert.deepEqual(leadStagePresetFields([]), { stageIds: [], stageId: "all" });
});
