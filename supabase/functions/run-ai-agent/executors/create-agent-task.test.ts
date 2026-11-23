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
  "a weekly reminder runs at its requested Israel time, not 7 days after the last run",
  async () => {
    const fixture = executorClient([
      {
        id: "task",
        title: "weekly",
        status: "pending",
        schedule_type: "recurring",
        scheduled_at: "2026-11-13T14:00:00Z",
        next_run: "2026-11-27T14:00:00Z",
      },
    ]);
    await executeCreateAgentTask(
      {
        title: "weekly",
        schedule_type: "weekly",
        // Friday 16:00 Israel time; the model's cron was written in UTC.
        scheduled_at: "2026-11-13T14:00:00Z",
        cron_expression: "0 14 * * 5",
      },
      fixture.context,
    );
    const body = fixture.calls[0].body as Record<string, unknown>;
    assertObjectMatch(body, {
      schedule_type: "recurring",
      cron_expression: "0 16 * * 5",
      timezone: "Asia/Jerusalem",
    });
    const nextRun = new Date(String(body.next_run));
    assert(nextRun.getTime() > Date.now());
    const israel = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jerusalem",
      hourCycle: "h23",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(nextRun);
    assertEquals(israel, "Fri 16:00");
  },
);

Deno.test("a daily task with no time keeps its legacy schedule", async () => {
  const fixture = executorClient([
    {
      id: "task",
      title: "daily",
      status: "pending",
      schedule_type: "daily",
      scheduled_at: null,
      next_run: null,
    },
  ]);
  await executeCreateAgentTask(
    { title: "daily", schedule_type: "daily" },
    fixture.context,
  );
  assertObjectMatch(fixture.calls[0].body as Record<string, unknown>, {
    schedule_type: "daily",
    cron_expression: null,
  });
});
