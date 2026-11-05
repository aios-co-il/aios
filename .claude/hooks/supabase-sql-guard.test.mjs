import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadFunctionCatalog } from "./function-catalog.mjs";
import { askReason } from "./supabase-sql-guard.mjs";

const PRODUCTION = "zvoijyneresvkadpprel";
const STAGING = "efwzhyfpkocghdhhhaza";
const HOOK = fileURLToPath(
  new URL("./supabase-sql-guard.mjs", import.meta.url),
);
const CATALOG = loadFunctionCatalog(
  new URL("../../supabase/migrations/", import.meta.url),
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
    "select jsonb_set(settings, '{x}', 'null'), r.* from leads l, jsonb_to_record(l.raw) as r(phone text)",
    "select is_super_admin(), user_can_delete_users_for_tenant(auth.uid(), 't'), client_auto_send_allowed('c')",
    "select * from public.whatsapp_group_client_ids('g') as ids(client_id)",
    "(select 1) union all (select 2)",
    "explain select * from clients",
    "begin; select 1; rollback;",
    "set statement_timeout = '60s'; select count(*) from chat_messages",
    "SET LOCAL enable_seqscan = off; EXPLAIN SELECT id FROM chat_messages",
    "begin; set transaction read only; select count(*) from leads; rollback;",
    "select * from cron.job; select * from net._http_response limit 5",
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
    "select setval('seq', 1)",
    "select * from clients for update",
    "do $$ begin delete from x; end $$",
    'update "clients" set x = 1',
    "begin; delete from tasks; rollback;",
    "select 1 -- note\rdelete from clients",
    "notify task_events, 'x'",
  ])("%s", (query) => {
    expect(reasonFor(PRODUCTION, query)).toMatch(/Production write/);
  });

  it("asks for every repo function the migrations do not declare read-only", () => {
    const writers = [...CATALOG]
      .filter(([, facts]) => !facts.readOnly && !facts.sends)
      .map(([name]) => name);

    expect(writers).toEqual(
      expect.arrayContaining([
        "check_idempotency",
        "get_signature_by_token",
        "archive_leads",
      ]),
    );
    for (const name of writers) {
      expect(reasonFor(PRODUCTION, `select public.${name}('x')`), name).toMatch(
        /Production write/,
      );
    }
  });

  it("lets every read-only repo function through", () => {
    const readers = [...CATALOG]
      .filter(([, facts]) => facts.readOnly && !facts.sends)
      .map(([name]) => name);

    expect(readers.length).toBeGreaterThan(100);
    for (const name of readers) {
      expect(
        reasonFor(PRODUCTION, `select public.${name}('x')`),
        name,
      ).toBeNull();
    }
  });

  it.each([
    ["missing project id", undefined],
    ["upper case", "ZVOIJYNERESVKADPPREL"],
    ["padded", " zvoijyneresvkadpprel "],
  ])("treats a %s as Production", (_label, projectId) => {
    expect(reasonFor(projectId, "delete from clients")).toMatch(
      /Production write/,
    );
  });
});

describe("Writes outside Production", () => {
  it.each([
    "begin; update clients set name = 'x' where id = 1; rollback;",
    "BEGIN; INSERT INTO public.whatsapp_groups (tenant_id, group_name) VALUES ('t', 'g'); ROLLBACK;",
    "begin; do $test$ begin perform public.archive_leads('x'); end $test$; rollback;",
    "begin; insert into leads (name) values ('a'); rollback; begin; delete from tasks; rollback;",
    "BEGIN; DO $test$ DECLARE v int; BEGIN INSERT INTO t VALUES (1); END $test$; ROLLBACK; SELECT 'passed' AS result;",
  ])("run without a prompt when rolled back: %s", (query) => {
    expect(reasonFor(STAGING, query)).toBeNull();
  });

  it.each([
    "update tasks set due_date = now() where id = 'x'",
    "insert into leads (name, phone) values ('a', '050')",
    "select archive_leads('x')",
    "begin; update clients set x = 1; commit;",
    "begin; update clients set x = 1; rollback; update clients set x = 2",
    "begin; select 1; rollback; select archive_leads('x')",
    "update cron.job set active = true where jobname = 'send-reports'",
    "insert into net.http_request_queue select * from x",
  ])("ask when committed: %s", (query) => {
    expect(reasonFor(STAGING, query)).toMatch(/commits a write/);
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
    "select kick_internal_function('x')",
    "select send_whatsapp_message('972', 'x')",
    "select \"sendWhatsapp\"('x')",
    "select create_notifications('x')",
    "begin; do $body$ begin perform claude_notify_david('x'); end $body$; rollback;",
    "insert into net.http_request_queue (method, url) values ('POST', 'https://x')",
  ])("%s", (query) => {
    expect(reasonFor(STAGING, query)).toMatch(/send a message/);
    expect(reasonFor(PRODUCTION, query)).toMatch(/send a message/);
  });
});

describe("Unreadable calls ask", () => {
  it.each([
    ["unclosed string", "select 'oops"],
    ["unclosed comment", "select 1 /* oops"],
    ["unclosed dollar body", "do $$ begin delete from x;"],
    [
      "apostrophe in a dollar literal",
      "select $$David's$$ as a; delete from clients; select $$Carmen's$$ as b",
    ],
    ["unicode identifier", "select U&\"claude_\\006eotify_david\"('x')"],
  ])("%s", (_label, query) => {
    expect(reasonFor(STAGING, query)).toMatch(/Could not read/);
  });

  it.each([
    ["no query", { tool_input: { project_id: STAGING } }],
    ["no payload", null],
  ])("%s", (_label, payload) => {
    expect(askReason(payload)).toMatch(/Could not read/);
  });
});

describe("hook process", () => {
  /** Runs the hook script the way Claude Code does, with the payload on stdin. */
  function runHook(stdin, script = HOOK) {
    return spawnSync(process.execPath, [script], {
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

  it("still runs when reached through a symlinked project path", () => {
    const dir = join(tmpdir(), `sql-guard-link-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    const link = join(dir, "hooks");
    symlinkSync(fileURLToPath(new URL(".", import.meta.url)), link);
    try {
      const result = runHook(
        JSON.stringify({
          tool_input: { project_id: PRODUCTION, query: "delete from x" },
        }),
        join(link, "supabase-sql-guard.mjs"),
      );

      expect(
        JSON.parse(result.stdout).hookSpecificOutput.permissionDecision,
      ).toBe("ask");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
