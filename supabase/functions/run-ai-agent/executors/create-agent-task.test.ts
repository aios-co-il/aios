import { assert, assertEquals, assertObjectMatch } from "jsr:@std/assert@1";
import { executeCreateAgentTask } from "./create-agent-task.ts";
import type { ToolWhatsAppNotify } from "../tool-context.ts";
import { executorClient } from "./executor-client.test-fixture.ts";

Deno.test(
  "a reminder retains its exact originating WhatsApp destination",
  async () => {
    const notify: ToolWhatsAppNotify = {
      surface: "whatsapp",
      chat_id: "group@g.us",
      connection_user_id: "owner",
      integration_id: "line",
    };
    const fixture = executorClient(
      [
        {
          id: "task",
          title: "reminder",
          status: "pending",
          schedule_type: "once",
          scheduled_at: null,
        },
      ],
      200,
      {
        agentId: "agent",
        actorUserId: "22222222-2222-4222-8222-222222222222",
        callerPhone: "+972500000000",
        waNotify: notify,
      },
    );
    const result = await executeCreateAgentTask(
      { title: "reminder", description: "Call" },
      fixture.context,
    );
    assertEquals(result.agent_task_id, "task");
    assertEquals(result.reminder_phone, "+972500000000");
    assertEquals(
      fixture.calls.map((call) => call.method),
      ["POST"],
    );
    const body = fixture.calls[0].body;
    assert(body !== null && typeof body === "object");
    assertObjectMatch(body, {
      agent_id: "agent",
      tenant_id: "t1",
      title: "reminder",
      created_by: "22222222-2222-4222-8222-222222222222",
      result: { notify, reminder_delivery: { message: "Call" } },
    });
  },
);

Deno.test(
  "a weekly reminder is stored as a cron schedule at its Israel hour",
  async () => {
    const fixture = executorClient(
      [
        {
          id: "task",
          title: "reminder",
          status: "pending",
          schedule_type: "recurring",
          scheduled_at: "2099-01-02T14:00:00Z",
          next_run: "2099-01-02T14:00:00Z",
        },
      ],
      200,
      { agentId: "agent" },
    );

    const result = await executeCreateAgentTask(
      {
        title: "reminder",
        schedule_type: "weekly",
        // Friday 16:00 in Israel (UTC+2), with the cron Carmen sent in UTC.
        scheduled_at: "2099-01-02T14:00:00Z",
        cron_expression: "0 14 * * 5",
      },
      fixture.context,
    );

    const body = fixture.calls[0].body;
    assert(body !== null && typeof body === "object");
    assertObjectMatch(body, {
      schedule_type: "recurring",
      cron_expression: "0 16 * * 5",
      timezone: "Asia/Jerusalem",
    });
    assert("next_run" in body && typeof body.next_run === "string");
    assertEquals(new Date(body.next_run).getUTCDay(), 5);
    assertEquals(result.scheduled_at_utc, "2099-01-02T14:00:00Z");
  },
);
