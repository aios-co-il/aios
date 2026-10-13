import assert from "node:assert/strict";
import test from "node:test";
import {
  applyStatusActionFields,
  applyTriggerStatusCondition,
  buildLeadStatusChangedData,
  decodeStatusSelection,
  leadStatusUpdateColumns,
  resolveStatusRecordId,
  resolveStoredStatusSelection,
  statusFilterMatches,
  statusUpdateTable,
} from "./automation-status.ts";

test("status filter matches a funnel stage and ignores the same key on a response status", () => {
  assert.equal(
    statusFilterMatches("proposal_sent", "pipeline_stage", {
      new_status: "proposal_sent",
      status_kind: "pipeline_stage",
    }),
    true,
  );
  assert.equal(
    statusFilterMatches("proposal_sent", "pipeline_stage", {
      status: "proposal_sent",
      status_kind: "response_status",
    }),
    false,
  );
  assert.equal(
    statusFilterMatches("proposal_sent", null, {
      new_status: "proposal_sent",
    }),
    true,
  );
  assert.equal(
    statusFilterMatches("any", "pipeline_stage", { status: "new" }),
    true,
  );
});

test("lead action writes the pipeline column or the response status column", () => {
  assert.deepEqual(leadStatusUpdateColumns("pipeline_stage", "meeting"), {
    status: "meeting",
  });
  assert.deepEqual(leadStatusUpdateColumns("response_status", "no_answer_1"), {
    response_status: "no_answer_1",
  });
  assert.deepEqual(leadStatusUpdateColumns(undefined, "new"), {
    status: "new",
  });
  assert.equal(statusUpdateTable("client"), "clients");
  assert.equal(resolveStatusRecordId("lead", { lead_id: "lead-1" }), "lead-1");
});

test("encoded selections keep the raw key for saved automations", () => {
  const conditions: Record<string, unknown> = {};
  applyTriggerStatusCondition(conditions, "pipeline_stage:closed");
  assert.deepEqual(conditions, {
    new_status: "closed",
    status_kind: "pipeline_stage",
  });

  const configuration: Record<string, unknown> = { entity: "lead" };
  applyStatusActionFields(configuration, "response_status:in_progress");
  assert.equal(configuration.status, "in_progress");
  assert.equal(configuration.status_field, "response_status");

  assert.deepEqual(decodeStatusSelection("legacy_key"), {
    kind: null,
    value: "legacy_key",
  });
  assert.equal(
    resolveStoredStatusSelection("closed", [
      { kind: "pipeline_stage", value: "closed" },
      { kind: "response_status", value: "no_answer_1" },
    ]),
    "pipeline_stage:closed",
  );
});

test("lead status events carry the record id and the kind", () => {
  const data = buildLeadStatusChangedData({
    id: "lead-9",
    kind: "response_status",
    newStatus: "no_answer_2",
    oldStatus: null,
    contact_name: "דנה",
  });
  assert.equal(data.id, "lead-9");
  assert.equal(data.lead_id, "lead-9");
  assert.equal(data.new_status, "no_answer_2");
  assert.equal(data.status_kind, "response_status");
  assert.equal(
    statusFilterMatches("no_answer_2", "response_status", data),
    true,
  );
});
