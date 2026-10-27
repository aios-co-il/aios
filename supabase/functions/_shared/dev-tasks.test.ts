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

/** A client whose dev_tasks read returns this row; any write fails the test. */
function taskDb(row: Record<string, unknown>) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    single: () => Promise.resolve({ data: row, error: null }),
    update: () => {
      throw new Error("a refused task must not be written");
    },
  };
  return { from: () => builder };
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
    // Past the approval check it goes on to the send, which needs its keys.
    const error = await assertRejects(() =>
      dispatchDevTask(taskDb(approved), {
        tenantId: "tenant-1",
        taskId: "task-1",
      }),
    );
    assertEquals(error instanceof DevTaskNotApprovedError, false);
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

/** Records dev_tasks updates; reads return this row. */
function recordingDb(row: Record<string, unknown>) {
  const updates: Record<string, unknown>[] = [];
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    insert: () => Promise.resolve({ data: null, error: null }),
    update: (patch: Record<string, unknown>) => {
      updates.push(patch);
      return builder;
    },
    maybeSingle: () => Promise.resolve({ data: row, error: null }),
    single: () =>
      Promise.resolve({ data: { ...row, ...updates.at(-1) }, error: null }),
  };
  return { updates, db: { from: () => builder } };
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
