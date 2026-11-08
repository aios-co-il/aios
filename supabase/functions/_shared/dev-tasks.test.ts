import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { Database } from "./database.types.ts";
import { z } from "npm:zod@3.25.76";
import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  approveOnSend,
  DevTaskNotApprovedError,
  dispatchDevTask,
  extractClaudeSessionUrl,
  extractDevTaskId,
  extractPrUrlFromAgentReply,
  matchDispatchRowToDevTask,
  matchSessionRowToDevTask,
} from "./dev-tasks.ts";

Deno.test("extractDevTaskId parses context line", () => {
  assertEquals(
    extractDevTaskId(
      "dev_task_id: 1371fdd5-93ef-42b3-80af-99307e48096f\nBase branch: develop",
    ),
    "1371fdd5-93ef-42b3-80af-99307e48096f",
  );
});

Deno.test("matchDispatchRowToDevTask prefers dev_task_id in context", () => {
  const taskId = "1371fdd5-93ef-42b3-80af-99307e48096f";
  assertEquals(
    matchDispatchRowToDevTask(
      {
        cursor_agent_id: "bc-abc",
        context: `dev_task_id: ${taskId}`,
        request_text: "Other title",
      },
      taskId,
      "Fix dispatch error",
    ),
    true,
  );
  assertEquals(
    matchDispatchRowToDevTask(
      {
        cursor_agent_id: "bc-abc",
        context: "dev_task_id: 00000000-0000-0000-0000-000000000001",
        request_text: "Fix dispatch error",
      },
      taskId,
      "Fix dispatch error",
    ),
    false,
  );
});

Deno.test("matchDispatchRowToDevTask falls back to request_text title", () => {
  const taskId = "1371fdd5-93ef-42b3-80af-99307e48096f";
  assertEquals(
    matchDispatchRowToDevTask(
      {
        cursor_agent_id: "bc-xyz",
        context: "",
        request_text: "Fix dispatch error",
      },
      taskId,
      "Fix dispatch error",
    ),
    true,
  );
});

Deno.test("extractPrUrlFromAgentReply finds GitHub PR link", () => {
  assertEquals(
    extractPrUrlFromAgentReply(
      "PR: https://github.com/davidcastelnuovo/aios/pull/709",
    ),
    "https://github.com/davidcastelnuovo/aios/pull/709",
  );
});

Deno.test(
  "matchSessionRowToDevTask matches display name and linked dev_task",
  () => {
    const taskId = "1371fdd5-93ef-42b3-80af-99307e48096f";
    assertEquals(
      matchSessionRowToDevTask(
        {
          cursor_agent_id: "bc-s1",
          display_name: "AIOS · Fix dispatch error",
          dev_task_id: null,
        },
        taskId,
        "Fix dispatch error",
      ),
      true,
    );
    assertEquals(
      matchSessionRowToDevTask(
        { cursor_agent_id: "bc-s2", dev_task_id: taskId },
        taskId,
        "Any title",
      ),
      true,
    );
    assertEquals(
      matchSessionRowToDevTask(
        {
          cursor_agent_id: "bc-s3",
          dev_task_id: "00000000-0000-0000-0000-000000000002",
        },
        taskId,
        "Fix dispatch error",
      ),
      false,
    );
  },
);

Deno.test(
  "extractClaudeSessionUrl reads the session link from claude-mcp",
  () => {
    assertEquals(
      extractClaudeSessionUrl(
        "✅ Dispatched the dev task to Claude Code.\nSession: https://claude.ai/code/session_01AbC",
      ),
      "https://claude.ai/code/session_01AbC",
    );
    assertEquals(extractClaudeSessionUrl("(session created)"), "");
  },
);

/** Return a generated client whose reads provide the fixture and whose writes fail. */
function taskDb(row: Record<string, unknown>) {
  return createClient<Database>("https://example.invalid", "test-key", {
    auth: { persistSession: false },
    global: {
      fetch: async (_input, init) => {
        if (init?.method && init.method !== "GET") {
          throw new Error("a refused task must not be written");
        }
        return new Response(JSON.stringify(row), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  });
}

const DRAFT = {
  id: "task-1",
  tenant_id: "tenant-1",
  title: "Fix dispatch",
  status: "draft",
  assigned_agent: "cursor",
  approved_by: null,
};

Deno.test("dispatchDevTask refuses a task no person approved", async () => {
  for (const row of [
    DRAFT,
    { ...DRAFT, assigned_agent: "claude" },
    // Approved in name only: update_dev_task can set the status without an approver.
    { ...DRAFT, status: "approved", approved_by: null },
    { ...DRAFT, status: "cancelled", approved_by: "user-1" },
  ])
    await assertRejects(
      () =>
        dispatchDevTask(taskDb(row), {
          tenantId: "tenant-1",
          taskId: "task-1",
        }),
      DevTaskNotApprovedError,
    );
});

Deno.test(
  "dispatchDevTask sends a task a person approved, and reports one already sent",
  async () => {
    const approved = { ...DRAFT, status: "approved", approved_by: "user-1" };
    // Past the approval check it goes on to the send, which needs its keys. The keys are
    // removed here, so a machine that has them set never sends a real task to Cursor.
    const keys = ["SUPABASE_URL", "CURSOR_MCP_BEARER"].map(
      (name) => [name, Deno.env.get(name)] as const,
    );
    for (const [name] of keys) Deno.env.delete(name);
    try {
      await assertRejects(
        () =>
          dispatchDevTask(taskDb(approved), {
            tenantId: "tenant-1",
            taskId: "task-1",
          }),
        Error,
        "CURSOR_MCP_BEARER missing",
      );
    } finally {
      for (const [name, value] of keys)
        if (value !== undefined) Deno.env.set(name, value);
    }
    const sent = await dispatchDevTask(
      taskDb({
        ...DRAFT,
        status: "sent_to_cursor",
        cursor_session_id: "bc-1",
        cursor_session_url: "https://cursor.com/agents/bc-1",
      }),
      { tenantId: "tenant-1", taskId: "task-1" },
    );
    assertEquals(sent.delivered, true);
  },
);

/** Record HTTP writes while exercising the generated Supabase client contract. */
function recordingDb(row: Record<string, unknown>) {
  const updates: Array<Record<string, unknown>> = [];
  const db = createClient<Database>("https://example.invalid", "test-key", {
    auth: { persistSession: false },
    global: {
      fetch: async (input, init) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input),
        );
        if (init?.method === "PATCH") {
          updates.push(
            z.record(z.unknown()).parse(JSON.parse(String(init.body))),
          );
        }
        const data = url.pathname.endsWith("/dev_tasks")
          ? { ...row, ...updates.at(-1) }
          : null;
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  });
  return { updates, db };
}

Deno.test(
  "pressing send in the Command Center approves a draft as the signed-in user",
  async () => {
    const draft = recordingDb(DRAFT);
    await approveOnSend(draft.db, "tenant-1", "task-1", "user-1");
    assertEquals(draft.updates[0]?.approved_by, "user-1");
    assertEquals(draft.updates[0]?.status, "approved");
    // A service call is not a person: nothing is approved for it.
    const service = recordingDb(DRAFT);
    await approveOnSend(service.db, "tenant-1", "task-1", null);
    assertEquals(service.updates.length, 0);
    // Already approved by a person: kept as it is.
    const approved = recordingDb({
      ...DRAFT,
      status: "approved",
      approved_by: "user-2",
    });
    await approveOnSend(approved.db, "tenant-1", "task-1", "user-1");
    assertEquals(approved.updates.length, 0);
  },
);
