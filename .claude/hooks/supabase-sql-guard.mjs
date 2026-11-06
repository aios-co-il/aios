#!/usr/bin/env node
/**
 * PreToolUse guard for Supabase `execute_sql`.
 *
 * `.claude/settings.json` approves `execute_sql` without a prompt so agents can
 * read data freely. This guard puts the prompt back for the two things an agent
 * must never run on its own (AGENTS.md):
 * - a write to Production ("never modify Production directly");
 * - a call that can send a message or reach the network, in any environment
 *   ("do not replay old WhatsApp notifications").
 *
 * It is a safety net for mistakes, not a SQL parser. When it cannot read a
 * query safely it asks.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const PRODUCTION_PROJECT_ID = "zvoijyneresvkadpprel";

// Statements that only read. Anything else on Production asks.
const READ_STATEMENTS = new Set([
  "select",
  "with",
  "explain",
  "show",
  "table",
  "values",
]);

// Transaction control changes no data; the statements inside are checked on their own.
const NEUTRAL_STATEMENTS = new Set([
  "begin",
  "start",
  "commit",
  "rollback",
  "end",
]);

// Words that turn a read statement into a write: DML inside a CTE or
// EXPLAIN ANALYZE, SELECT ... INTO (creates a table), row locks.
const WRITE_KEYWORDS =
  /\b(insert|update|delete|merge|truncate|into|copy|lock)\b/;

// Schemas whose functions reach the network or schedule jobs.
const SEND_SCHEMAS = new Set(["net", "http", "dblink", "pgmq", "cron"]);

// Function-name words that mean "send something", checked in every environment.
const SEND_WORDS = new Set([
  "notify",
  "send",
  "resend",
  "replay",
  "whatsapp",
  "telegram",
  "email",
  "sms",
  "push",
  "alert",
  "webhook",
  "http",
  "enqueue",
  "dispatch",
  "deliver",
  "broadcast",
  "publish",
]);

// Function-name words that mean "change data", checked on Production only.
const WRITE_WORDS = new Set([
  "insert",
  "update",
  "delete",
  "upsert",
  "merge",
  "create",
  "drop",
  "alter",
  "archive",
  "purge",
  "cleanup",
  "backfill",
  "repair",
  "restore",
  "reset",
  "set",
  "assign",
  "unassign",
  "grant",
  "revoke",
  "enable",
  "disable",
  "activate",
  "deactivate",
  "mark",
  "record",
  "log",
  "process",
  "run",
  "execute",
  "exec",
  "trigger",
  "schedule",
  "cancel",
  "claim",
  "release",
  "rotate",
  "register",
  "save",
  "store",
  "write",
  "add",
  "remove",
  "clear",
  "flush",
  "toggle",
  "approve",
  "reject",
  "ensure",
  "seed",
  "import",
  "sync",
  "refresh",
  "recompute",
  "recalculate",
  "apply",
  "fix",
  "move",
  "copy",
  "transfer",
  "link",
  "unlink",
  "attach",
  "detach",
  "close",
  "reopen",
  "pause",
  "resume",
  "retry",
  "rebuild",
  "migrate",
  "upgrade",
  "promote",
  "demote",
  "invite",
  "accept",
  "terminate",
  "reload",
  "increment",
  "decrement",
  "bump",
  "touch",
  "init",
  "initialize",
  "provision",
  "setval",
  "nextval",
  "lo",
]);

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
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
    return "Could not read this SQL safely (unclosed quote or comment). Confirm it before it runs.";
  }

  const calls = functionCalls(sql);
  const sendCall = calls.find(isSendCall);
  if (sendCall) {
    return `This query calls ${sendCall}(), which can send a message or reach the network. Confirm before it runs.`;
  }

  if (payload?.tool_input?.project_id !== PRODUCTION_PROJECT_ID) {
    return null;
  }

  const writeStatement = statements(sql).find(isWriteStatement);
  if (writeStatement) {
    return `Production write ("${writeStatement.slice(0, 60)}"). AGENTS.md: never modify Production directly. Confirm before it runs.`;
  }

  const writeCall = calls.find(isWriteCall);
  if (writeCall) {
    return `This Production query calls ${writeCall}(), which may change data. Confirm before it runs.`;
  }

  return null;
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
 * Lowercases the SQL and removes what cannot run: comments and the contents of
 * single-quoted strings. Quoted identifiers keep their text so
 * `"claude_notify_david"(...)` is still seen. Dollar-quoted bodies are code
 * (DO blocks, function bodies), so only their delimiters are removed.
 * Returns null when a quote or comment never closes.
 * @param {string} query
 * @returns {string | null}
 */
export function normalizeSql(query) {
  let out = "";
  let i = 0;
  while (i < query.length) {
    const ch = query[i];
    const next = query[i + 1];
    if (ch === "-" && next === "-") {
      const end = query.indexOf("\n", i);
      if (end === -1) {
        break;
      }
      out += " ";
      i = end;
    } else if (ch === "/" && next === "*") {
      const end = blockCommentEnd(query, i);
      if (end === -1) {
        return null;
      }
      out += " ";
      i = end;
    } else if (ch === "'") {
      const end = stringEnd(query, i, isEscapeString(query, i));
      if (end === -1) {
        return null;
      }
      out += "''";
      i = end;
    } else if (ch === '"') {
      const end = identifierEnd(query, i);
      if (end === -1) {
        return null;
      }
      out += query
        .slice(i + 1, end - 1)
        .replace(/""/g, "_")
        .replace(/\W/g, "_");
      i = end;
    } else if (
      ch === "$" &&
      /[A-Za-z_$]/.test(next ?? "") &&
      !/\w/.test(query[i - 1] ?? "")
    ) {
      const tag = /^\$[A-Za-z_]*\$/.exec(query.slice(i));
      out += " ";
      i += tag ? tag[0].length : 1;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out.toLowerCase();
}

/** Index just past a (nested) block comment that starts at `start`, or -1. */
function blockCommentEnd(query, start) {
  let depth = 0;
  for (let i = start; i < query.length - 1; i += 1) {
    if (query[i] === "/" && query[i + 1] === "*") {
      depth += 1;
      i += 1;
    } else if (query[i] === "*" && query[i + 1] === "/") {
      depth -= 1;
      i += 1;
      if (depth === 0) {
        return i + 1;
      }
    }
  }
  return -1;
}

/** True when the quote at `start` opens an E'...' string, where backslash escapes. */
function isEscapeString(query, start) {
  return (
    /[eE]/.test(query[start - 1] ?? "") && !/\w/.test(query[start - 2] ?? "")
  );
}

/** Index just past the single-quoted string that starts at `start`, or -1. */
function stringEnd(query, start, backslashEscapes) {
  for (let i = start + 1; i < query.length; i += 1) {
    if (backslashEscapes && query[i] === "\\") {
      i += 1;
    } else if (query[i] === "'") {
      if (query[i + 1] === "'") {
        i += 1;
      } else {
        return i + 1;
      }
    }
  }
  return -1;
}

/** Index just past the double-quoted identifier that starts at `start`, or -1. */
function identifierEnd(query, start) {
  for (let i = start + 1; i < query.length; i += 1) {
    if (query[i] === '"') {
      if (query[i + 1] === '"') {
        i += 1;
      } else {
        return i + 1;
      }
    }
  }
  return -1;
}

/** Non-empty statements of normalized SQL, without leading parentheses. */
function statements(sql) {
  return sql
    .split(";")
    .map((statement) => statement.trim().replace(/^[(\s]+/, ""))
    .filter(Boolean);
}

/** True when a normalized statement can change data. */
function isWriteStatement(statement) {
  const first = /^[a-z]+/.exec(statement)?.[0] ?? "";
  if (NEUTRAL_STATEMENTS.has(first)) {
    return false;
  }
  return !READ_STATEMENTS.has(first) || WRITE_KEYWORDS.test(statement);
}

/** Every `name(` or `schema.name(` in normalized SQL. */
function functionCalls(sql) {
  return [...sql.matchAll(/([a-z_][\w$]*(?:\s*\.\s*[a-z_][\w$]*)?)\s*\(/g)].map(
    (match) => match[1].replace(/\s+/g, ""),
  );
}

/** True when a function call can send a message or reach the network. */
function isSendCall(call) {
  const [schema, name] = call.includes(".") ? call.split(".") : ["", call];
  return (
    SEND_SCHEMAS.has(schema) ||
    nameWords(name).some((word) => SEND_WORDS.has(word))
  );
}

/** True when a function call's name says it changes data. */
function isWriteCall(call) {
  const name = call.includes(".") ? call.split(".")[1] : call;
  return nameWords(name).some((word) => WRITE_WORDS.has(word));
}

/** Words of a snake_case function name. */
function nameWords(name) {
  return name.split(/[_$]+/).filter(Boolean);
}
