import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  automationLoopKey,
  firesStatusTriggers,
  leadStatusChange,
  leadStatusChangedRequest,
} from "./status-fanout.ts";

Deno.test("firesStatusTriggers", async (t) => {
  await t.step("is off unless the step asks for it", () => {
    assertStrictEquals(firesStatusTriggers({ entity: "lead" }), false);
    assertStrictEquals(
      firesStatusTriggers({ entity: "lead", fire_status_triggers: "true" }),
      false,
    );
  });

  await t.step("is on for a lead step that asks for it", () => {
    assertStrictEquals(
      firesStatusTriggers({ entity: "lead", fire_status_triggers: true }),
      true,
    );
  });

  await t.step("stays off for tasks and clients", () => {
    assertStrictEquals(
      firesStatusTriggers({ entity: "task", fire_status_triggers: true }),
      false,
    );
    assertStrictEquals(
      firesStatusTriggers({ entity: "client", fire_status_triggers: true }),
      false,
    );
  });
});

Deno.test("leadStatusChange", async (t) => {
  const before = { status: "new", response_status: "follow_up_week" };

  await t.step("names a response status change with its old value", () => {
    assertEquals(
      leadStatusChange(
        { status: "follow_up_sent", status_field: "response_status" },
        "lead-1",
        before,
      ),
      {
        leadId: "lead-1",
        kind: "response_status",
        oldStatus: "follow_up_week",
        newStatus: "follow_up_sent",
      },
    );
  });

  await t.step("treats a step without a status field as a funnel stage", () => {
    assertEquals(leadStatusChange({ status: "won" }, "lead-1", before), {
      leadId: "lead-1",
      kind: "pipeline_stage",
      oldStatus: "new",
      newStatus: "won",
    });
  });

  await t.step("is null when the lead already has the status", () => {
    assertStrictEquals(
      leadStatusChange(
        { status: "follow_up_week", status_field: "response_status" },
        "lead-1",
        before,
      ),
      null,
    );
  });

  await t.step("is null when the step sets no status", () => {
    assertStrictEquals(leadStatusChange({}, "lead-1", before), null);
  });
});

Deno.test("automationLoopKey", async (t) => {
  await t.step("keeps the plain key for runs without a new status", () => {
    assertStrictEquals(
      automationLoopKey({ trigger_type: "lead_created", data: {} }, "lead-1"),
      "lead_created:lead-1",
    );
    assertStrictEquals(
      automationLoopKey({ automationId: "auto-1" }, "lead-1"),
      "auto-1:lead-1",
    );
  });

  await t.step("tells apart moves of one lead to different statuses", () => {
    const toWeek = automationLoopKey(
      { trigger_type: "lead_status_changed", data: { new_status: "week" } },
      "lead-1",
    );
    const toSent = automationLoopKey(
      { trigger_type: "lead_status_changed", data: { new_status: "sent" } },
      "lead-1",
    );
    assertStrictEquals(toWeek === toSent, false);
  });

  await t.step("gives a move back to an earlier status the same key", () => {
    const first = automationLoopKey(
      { trigger_type: "lead_status_changed", data: { new_status: "week" } },
      "lead-1",
    );
    const again = automationLoopKey(
      { trigger_type: "lead_status_changed", data: { new_status: "week" } },
      "lead-1",
    );
    assertStrictEquals(first, again);
  });
});

Deno.test("leadStatusChangedRequest", async (t) => {
  const request = leadStatusChangedRequest(
    {
      leadId: "lead-1",
      kind: "response_status",
      oldStatus: "week",
      newStatus: "sent",
    },
    { tenantId: "tenant-1", depth: 0, chain: ["auto-1:lead-1"] },
  );

  await t.step("fires lead_status_changed in the run's org", () => {
    assertStrictEquals(request.trigger_type, "lead_status_changed");
    assertStrictEquals(request.tenant_id, "tenant-1");
  });

  await t.step("carries the payload the app sends for a status change", () => {
    assertStrictEquals(request.data.lead_id, "lead-1");
    assertStrictEquals(request.data.new_status, "sent");
    assertStrictEquals(request.data.old_status, "week");
    assertStrictEquals(request.data.status_kind, "response_status");
  });

  await t.step("goes one level deeper and passes the chain on", () => {
    assertStrictEquals(request._execution_depth, 1);
    assertEquals(request._execution_chain, ["auto-1:lead-1"]);
  });
});
