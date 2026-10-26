import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  applyStatusActionFields,
  applyTriggerStatusCondition,
  buildLeadStatusChangedData,
  decodeStatusSelection,
  leadStatusUpdateColumns,
  resolveStatusRecordId,
  resolveStoredStatusSelection,
  applyTriggerStatusFilters,
  encodeStoredTriggerFilters,
  readStatusFilters,
  readTriggerTypes,
  statusFilterMatches,
  statusFiltersMatch,
  statusUpdateTable,
} from "./automation-status.ts";

Deno.test(
  "status filter matches a funnel stage and ignores the same key on a response status",
  () => {
    assertStrictEquals(
      statusFilterMatches("proposal_sent", "pipeline_stage", {
        new_status: "proposal_sent",
        status_kind: "pipeline_stage",
      }),
      true,
    );
    assertStrictEquals(
      statusFilterMatches("proposal_sent", "pipeline_stage", {
        status: "proposal_sent",
        status_kind: "response_status",
      }),
      false,
    );
    assertStrictEquals(
      statusFilterMatches("proposal_sent", null, {
        new_status: "proposal_sent",
      }),
      true,
    );
    assertStrictEquals(
      statusFilterMatches("any", "pipeline_stage", { status: "new" }),
      true,
    );
  },
);

Deno.test(
  "lead action writes the pipeline column or the response status column",
  () => {
    assertEquals(leadStatusUpdateColumns("pipeline_stage", "meeting"), {
      status: "meeting",
    });
    assertEquals(leadStatusUpdateColumns("response_status", "no_answer_1"), {
      response_status: "no_answer_1",
    });
    assertEquals(leadStatusUpdateColumns(undefined, "new"), {
      status: "new",
    });
    assertStrictEquals(statusUpdateTable("client"), "clients");
    assertStrictEquals(
      resolveStatusRecordId("lead", { lead_id: "lead-1" }),
      "lead-1",
    );
  },
);

Deno.test("several statuses match with OR", () => {
  const filters = [
    { value: "no_answer_1", kind: "response_status" },
    { value: "proposal_sent", kind: "pipeline_stage" },
  ];
  assertStrictEquals(
    statusFiltersMatch(filters, {
      new_status: "proposal_sent",
      status_kind: "pipeline_stage",
    }),
    true,
  );
  assertStrictEquals(
    statusFiltersMatch(filters, {
      new_status: "no_answer_1",
      status_kind: "response_status",
    }),
    true,
  );
  assertStrictEquals(
    statusFiltersMatch(filters, {
      new_status: "closed",
      status_kind: "pipeline_stage",
    }),
    false,
  );
  assertStrictEquals(statusFiltersMatch([], { status: "new" }), true);

  const conditions: Record<string, unknown> = {};
  applyTriggerStatusFilters(conditions, [
    "response_status:no_answer_1",
    "pipeline_stage:proposal_sent",
  ]);
  assertEquals(readStatusFilters(conditions), filters);
  assertEquals(encodeStoredTriggerFilters(conditions), [
    "response_status:no_answer_1",
    "pipeline_stage:proposal_sent",
  ]);
  assertEquals(
    readTriggerTypes({
      trigger_type: "lead_status_changed",
      configuration: {
        trigger_types: ["lead_status_changed", "client_status_changed"],
      },
    }),
    ["lead_status_changed", "client_status_changed"],
  );
});

Deno.test("encoded selections keep the raw key for saved automations", () => {
  const conditions: Record<string, unknown> = {};
  applyTriggerStatusCondition(conditions, "pipeline_stage:closed");
  assertEquals(conditions, {
    new_status: "closed",
    status_kind: "pipeline_stage",
  });

  const configuration: Record<string, unknown> = { entity: "lead" };
  applyStatusActionFields(configuration, "response_status:in_progress");
  assertStrictEquals(configuration.status, "in_progress");
  assertStrictEquals(configuration.status_field, "response_status");

  assertEquals(decodeStatusSelection("legacy_key"), {
    kind: null,
    value: "legacy_key",
  });
  assertStrictEquals(
    resolveStoredStatusSelection("closed", [
      { kind: "pipeline_stage", value: "closed" },
      { kind: "response_status", value: "no_answer_1" },
    ]),
    "pipeline_stage:closed",
  );
});

Deno.test("lead status events carry the record id and the kind", () => {
  const data = buildLeadStatusChangedData({
    id: "lead-9",
    kind: "response_status",
    newStatus: "no_answer_2",
    oldStatus: null,
    contact_name: "דנה",
  });
  assertStrictEquals(data.id, "lead-9");
  assertStrictEquals(data.lead_id, "lead-9");
  assertStrictEquals(data.new_status, "no_answer_2");
  assertStrictEquals(data.status_kind, "response_status");
  assertStrictEquals(
    statusFilterMatches("no_answer_2", "response_status", data),
    true,
  );
});
