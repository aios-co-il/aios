#!/usr/bin/env node
/**
 * PreToolUse guard for Supabase `execute_sql`.
 *
 * `.claude/settings.json` approves `execute_sql` without a prompt so agents can
 * read data freely. This guard puts the prompt back where AGENTS.md says an
 * agent must not act alone:
 * - a call that can send a message or reach the network, in any environment
 *   ("do not replay old WhatsApp notifications");
 * - any write to Production ("never modify Production directly");
 * - a committed write anywhere else: database changes ship as migrations, and
 *   table triggers (leads, tasks, tenant_integrations) post to edge functions.
 *   Test scripts wrapped in BEGIN … ROLLBACK run without a prompt; pg_net only
 *   sends after commit.
 *
 * Repo functions are judged by their migrations (function-catalog.mjs); other
 * functions by the words in their names. It is a safety net for mistakes, not
 * a SQL parser: when it cannot read a query it asks, and settings.json blocks
 * the call if this script fails.
 */
import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { loadFunctionCatalog } from "./function-catalog.mjs";
import {
  firstWord,
  functionCalls,
  normalizeSql,
  statements,
} from "./sql-text.mjs";

const PRODUCTION_PROJECT_ID = "zvoijyneresvkadpprel";

/** Splits a space-separated word list into a set. */
const words = (list) => new Set(list.split(/\s+/).filter(Boolean));

// Statements that only read.
const READ_STATEMENTS = words("select with explain show table values");

// Transaction control changes no data; the statements inside are checked on their own.
const NEUTRAL_STATEMENTS = words("begin start commit rollback end");

// Session and planner settings a careful read may set first.
const NEUTRAL_SET =
  /^set\s+(local\s+|session\s+)?(statement_timeout|lock_timeout|idle_in_transaction_session_timeout|timezone|time\s+zone|enable_\w+|work_mem|jit|plan_cache_mode|random_page_cost)\b|^set\s+transaction\s+read\s+only\b/;

// Words that turn a read statement into a write: DML inside a CTE or
// EXPLAIN ANALYZE, SELECT ... INTO (creates a table), row locks.
const WRITE_KEYWORDS =
  /\b(insert|update|delete|merge|truncate|into|copy|lock)\b/;

// Schemas whose functions reach the network or schedule jobs.
const SEND_SCHEMAS = words("net http dblink pgmq cron");

// For functions outside the repo: name words that mean "send something" (by prefix,
// so `notifications` counts) and "change data".
const SEND_PREFIXES = [
  ...words(`notif send resend replay whatsapp telegram email sms push alert webhook
  http enqueue dispatch deliver broadcast publish kick invoke`),
];
const WRITE_WORDS = words(`
  insert update delete upsert merge create drop alter archive purge cleanup
  backfill repair restore reset set assign unassign grant revoke enable disable
  activate deactivate reactivate mark record log process run execute exec
  trigger schedule cancel claim release rotate register save store write add
  remove clear flush toggle approve reject ensure seed import sync refresh
  recompute recalculate apply fix move copy transfer link unlink attach detach
  close reopen pause resume retry rebuild migrate upgrade promote demote invite
  accept terminate reload increment decrement bump touch init initialize
  provision resolve confirm complete queue advance patch edit submit decline
  acquire lease decay settle offboard produce setval nextval lo`);

// Built-ins whose names contain a write word but only compute a value.
const PURE_BUILTINS = words(`
  jsonb_set jsonb_set_lax jsonb_insert array_remove log log10 jsonb_to_record
  json_to_record jsonb_populate_record json_populate_record pg_trigger_depth`);

const CATALOG = loadFunctionCatalog(
  new URL("../../supabase/migrations/", import.meta.url),
);

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
) {
  main();
}

/** Reads the hook payload from stdin and prints an "ask" decision when the query needs one. */
function main() {
  const reason = askReason(readPayload());
  if (reason) {
    process.stdout.write(JSON.stringify(askDecision(reason)));
  }
}

/**
 * Returns why this `execute_sql` call needs David's confirmation, or null when
 * it can run without a prompt.
 * @param {{ tool_input?: { project_id?: unknown, query?: unknown } } | null} payload
 * @returns {string | null}
 */
export function askReason(payload) {
  const query = payload?.tool_input?.query;
  if (typeof query !== "string") {
    return "Could not read this SQL call. Confirm it before it runs.";
  }

  const sql = normalizeSql(query);
  if (sql === null) {
    return "Could not read this SQL safely (unclosed quote, comment or dollar body). Confirm it before it runs.";
  }

  const calls = functionCalls(sql, SEND_SCHEMAS);
  const sendCall = calls.find(isSendCall);
  if (sendCall) {
    return `This query calls ${sendCall}(), which can send a message or reach the network. Confirm before it runs.`;
  }

  const write = describeWrite(sql, calls);
  if (!write) {
    return null;
  }
  if (isProduction(payload.tool_input.project_id)) {
    return `Production write (${write}). AGENTS.md: never modify Production directly. Confirm before it runs.`;
  }
  if (isRolledBack(sql)) {
    return null;
  }
  return `This query commits a write (${write}). Database changes ship as migrations, and table triggers can send messages. Wrap a test in BEGIN … ROLLBACK, or confirm.`;
}

/**
 * Builds the PreToolUse output that makes Claude Code ask, even though the
 * settings allow the tool.
 * @param {string} reason
 */
export function askDecision(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: reason,
    },
  };
}

/** Parses the hook payload from stdin; null when it is not JSON. */
function readPayload() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

/**
 * True for the Production project, and for a missing or unreadable id: a
 * Supabase server set up for one project takes no project_id at all.
 */
function isProduction(projectId) {
  return (
    typeof projectId !== "string" ||
    projectId.trim().toLowerCase() === PRODUCTION_PROJECT_ID
  );
}

/** Short description of the first thing in the SQL that can change data, or null. */
function describeWrite(sql, calls) {
  const statement = statements(sql).find(isWriteStatement);
  if (statement) {
    return `"${statement.slice(0, 60)}"`;
  }
  const call = calls.find(isWriteCall);
  return call ? `${call}()` : null;
}

/** True when a normalized statement can change data. */
function isWriteStatement(statement) {
  const first = firstWord(statement);
  if (NEUTRAL_STATEMENTS.has(first) || NEUTRAL_SET.test(statement)) {
    return false;
  }
  return !READ_STATEMENTS.has(first) || WRITE_KEYWORDS.test(statement);
}

/**
 * True when the SQL opens a transaction, rolls it back, and only reads after
 * the last ROLLBACK (harnesses often end with `select 'passed'`), so nothing
 * it writes is kept. `END` is not treated as a commit because a DO body's
 * `end $$` splits into a statement of its own.
 */
function isRolledBack(sql) {
  const list = statements(sql);
  const firstWords = list.map(firstWord);
  const lastRollback = firstWords.lastIndexOf("rollback");
  const tail = list.slice(lastRollback + 1);
  return (
    ["begin", "start"].includes(firstWords[0]) &&
    lastRollback > 0 &&
    !firstWords.includes("commit") &&
    !describeWrite(tail.join(";"), functionCalls(tail.join(";"), SEND_SCHEMAS))
  );
}

/** True when a function call can send a message or reach the network. */
function isSendCall(call) {
  const [schema, name] = splitCall(call);
  if (SEND_SCHEMAS.has(schema)) {
    return true;
  }
  const known = CATALOG.get(name);
  if (known) {
    return known.sends;
  }
  return nameWords(name).some((word) =>
    SEND_PREFIXES.some((prefix) => word.startsWith(prefix)),
  );
}

/** True when a function call can change data. */
function isWriteCall(call) {
  const [schema, name] = splitCall(call);
  const known = CATALOG.get(name);
  if (known) {
    return !known.readOnly;
  }
  if (["", "pg_catalog"].includes(schema) && PURE_BUILTINS.has(name)) {
    return false;
  }
  return nameWords(name).some((word) => WRITE_WORDS.has(word));
}

/** `[schema, name]` of a call; schema is "" when unqualified. */
function splitCall(call) {
  return call.includes(".") ? call.split(".") : ["", call];
}

/** Words of a snake_case function name. */
function nameWords(name) {
  return name.split(/[_$]+/).filter(Boolean);
}
