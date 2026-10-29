import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  cursorSessionDisplayName,
  formatCursorSessionsForAgent,
  touchCursorTaskSession,
  trackCursorTaskSession,
  type CursorTaskSessionRow,
} from "./cursor-session-tracker.ts";

type Call = { table: string; op: string; args: unknown[] };

/** A query builder that records every call made on each table. */
function fakeDb() {
  const calls: Call[] = [];
  const from = (table: string) => {
    const builder = {
      upsert: (...args: unknown[]) => {
        calls.push({ table, op: "upsert", args });
        return Promise.resolve({ error: null });
      },
      update: (...args: unknown[]) => {
        calls.push({ table, op: "update", args });
        return builder;
      },
      eq: (...args: unknown[]) => {
        calls.push({ table, op: "eq", args });
        return builder;
      },
      then: (resolve: (value: { error: null }) => void) =>
        resolve({ error: null }),
    };
    return builder;
  };
  return { calls, db: { from } };
}

Deno.test("cursorSessionDisplayName prefers task title", () => {
  assertStrictEquals(
    cursorSessionDisplayName({
      taskTitle: "Fix pulse bug",
      sourceTool: "request_dev_task",
    }),
    "AIOS · Fix pulse bug",
  );
  assertStrictEquals(
    cursorSessionDisplayName({
      requestText: "Research WA triggers",
      sourceTool: "ask_cursor",
    }),
    "AIOS · Research WA triggers",
  );
});

Deno.test("formatCursorSessionsForAgent lists sessions for Carmen", () => {
  const rows: CursorTaskSessionRow[] = [
    {
      id: "1",
      tenant_id: "t1",
      cursor_agent_id: "bc-abc",
      session_url: "https://cursor.com/agents/bc-abc",
      display_name: "AIOS · Fix pulse",
      human_task_id: "task-1",
      task_title: "Fix pulse",
      source_tool: "request_dev_task",
      app_env: "staging",
      status: "running",
      created_at: "2026-08-30T00:00:00Z",
      updated_at: "2026-08-30T00:00:00Z",
      last_seen_at: "2026-08-30T00:00:00Z",
    },
  ];
  const text = formatCursorSessionsForAgent(rows);
  assertMatch(text, /bc-abc/);
  assertMatch(text, /Fix pulse/);
  assertMatch(text, /task=task-1/);
});

Deno.test("a session is keyed by its org and agent id", async () => {
  const { calls, db } = fakeDb();
  await trackCursorTaskSession(db, {
    tenantId: "t1",
    cursorAgentId: "bc-abc",
    displayName: "AIOS · Fix pulse",
    sourceTool: "request_dev_task",
  });
  const upsert = calls.find((call) => call.op === "upsert");
  assertEquals(upsert?.args[1], { onConflict: "tenant_id,cursor_agent_id" });
});

Deno.test("a touch changes only the org's own session", async () => {
  const { calls, db } = fakeDb();
  await touchCursorTaskSession(db, "t1", "bc-abc", "busy");
  assertEquals(
    calls.filter((call) => call.op === "eq").map((call) => call.args),
    [
      ["tenant_id", "t1"],
      ["cursor_agent_id", "bc-abc"],
    ],
  );
});
