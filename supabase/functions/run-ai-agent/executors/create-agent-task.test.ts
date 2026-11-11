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
