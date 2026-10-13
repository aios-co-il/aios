import assert from "node:assert/strict";
import test from "node:test";
import {
  leadMatchesStageFilter,
  leadStageIdsFromPreset,
  leadStagePresetFields,
  normalizeLeadStageIds,
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
