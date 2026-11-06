import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { askReason } from "./supabase-sql-guard.mjs";

const PRODUCTION = "zvoijyneresvkadpprel";
const STAGING = "efwzhyfpkocghdhhhaza";
const HOOK = fileURLToPath(
  new URL("./supabase-sql-guard.mjs", import.meta.url),
);

/** Runs the guard for one query on one project. */
function reasonFor(projectId, query) {
  return askReason({
    tool_name: "mcp__Supabase__execute_sql",
    tool_input: { project_id: projectId, query },
  });
}

describe("Production reads run without a prompt", () => {
  it.each([
    "select count(*) from clients",
    "SELECT id, updated_at, created_at, deleted_at, inserted_at FROM tasks WHERE tenant_id = 'x'",
    "with recent as (select * from pulse_instant_alert_log where created_at > now() - interval '7 days') select * from recent",
    "select * from chat_messages where body ilike '%insert into%' or body ilike '%drop table%'",
    "select * from t where note = 'it''s; delete from x'",
    "select E'it\\'s update' as label",
    "-- delete everything\nselect 1",
    "/* drop /* nested */ table */ select 1",
    "select pg_get_functiondef('public.claude_notify_david'::regproc)",
    "select jsonb_build_object('a', 1), generate_series(1, 3), string_agg(name, ','), date_trunc('day', now())",
    "select user_can_edit_client(auth.uid(), 'x'), is_super_admin()",
    "(select 1) union all (select 2)",
    "explain select * from clients",
    "begin; select 1; rollback;",
    "select * from ad_set_metrics where offset_days > 1",
  ])("%s", (query) => {
    expect(reasonFor(PRODUCTION, query)).toBeNull();
  });
});

describe("Production writes ask", () => {
  it.each([
    "update clients set name = 'x' where id = 1",
    "delete from tasks",
    "insert into logs (msg) values ('x')",
    "alter table clients add column x int",
    "with gone as (delete from x returning *) select * from gone",
    "explain analyze update clients set name = 'x'",
    "select * into backup_clients from clients",
    "select 1; drop table clients",
    "select archive_orphan_rows()",
    "select public.backfill_campaign_goals('x')",
    "select setval('seq', 1)",
    "select * from clients for update",
    "do $$ begin delete from x; end $$",
    'update "clients" set x = 1',
  ])("%s", (query) => {
    expect(reasonFor(PRODUCTION, query)).toMatch(/Confirm/);
  });
});

describe("Staging changes run without a prompt", () => {
  it.each([
    "update clients set name = 'x' where id = 1",
    "insert into logs (msg) values ('x')",
    "select archive_orphan_rows()",
  ])("%s", (query) => {
    expect(reasonFor(STAGING, query)).toBeNull();
  });
});

describe("Message sends ask in every environment", () => {
  it.each([
    "select claude_notify_david('hi')",
    "select public.claude_notify_david('hi')",
    "select \"claude_notify_david\"('hi')",
    "select net.http_post(url := 'https://x')",
    "select extensions.http_get('https://x')",
    "select cron.schedule('job', '* * * * *', 'select 1')",
    "select pg_notify('channel', 'x')",
    "select send_whatsapp_message('972', 'x')",
    "do $body$ begin perform claude_notify_david('x'); end $body$",
  ])("%s", (query) => {
    expect(reasonFor(STAGING, query)).toMatch(/send a message/);
    expect(reasonFor(PRODUCTION, query)).toMatch(/send a message/);
  });
});

describe("Unreadable calls ask", () => {
  it.each([
    [
      "unclosed string",
      { tool_input: { project_id: STAGING, query: "select 'oops" } },
    ],
    [
      "unclosed comment",
      { tool_input: { project_id: STAGING, query: "select 1 /* oops" } },
    ],
    ["no query", { tool_input: { project_id: STAGING } }],
    ["no payload", null],
  ])("%s", (_label, payload) => {
    expect(askReason(payload)).toMatch(/Could not read/);
  });
});

describe("hook process", () => {
  /** Runs the hook script the way Claude Code does, with the payload on stdin. */
  function runHook(stdin) {
    return spawnSync(process.execPath, [HOOK], {
      input: stdin,
      encoding: "utf8",
    });
  }

  it("prints an ask decision for a Production write", () => {
    const result = runHook(
      JSON.stringify({
        tool_input: { project_id: PRODUCTION, query: "delete from x" },
      }),
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).hookSpecificOutput).toMatchObject({
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
    });
  });

  it("prints nothing for a read, so the allow rule applies", () => {
    const result = runHook(
      JSON.stringify({
        tool_input: { project_id: PRODUCTION, query: "select 1" },
      }),
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("asks when stdin is not JSON", () => {
    const result = runHook("not json");

    expect(
      JSON.parse(result.stdout).hookSpecificOutput.permissionDecision,
    ).toBe("ask");
  });
});
