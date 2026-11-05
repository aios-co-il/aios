/**
 * Just enough SQL reading for supabase-sql-guard.mjs: strip what cannot run,
 * split statements, and list function calls. It does not parse SQL; callers
 * treat anything it cannot read as a reason to ask.
 */

// Words that can sit right before `name (` without making it a function call:
// `insert into t (cols)`, `references t (id)`, `create table t (`, `as alias(col)`,
// `with cte(col) as`.
const NOT_A_CALL_BEFORE = new Set(
  "into references table as with recursive".split(" "),
);

/**
 * Lowercases the SQL and removes what cannot run: comments and the contents of
 * single-quoted strings. Quoted identifiers keep their text, with camelCase
 * split, so `"claude_notify_david"(...)` and `"sendWhatsapp"(...)` are still
 * seen. Dollar-quoted bodies are code (DO blocks, function bodies), so they are
 * read the same way. Returns null when a quote, comment or dollar body never
 * closes, or for U&"..." identifiers whose escapes it does not decode.
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
      // Postgres ends a line comment at \n or \r.
      const end = query.slice(i).search(/[\r\n]/);
      if (end === -1) {
        break;
      }
      out += " ";
      i += end;
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
      if (/[uU]&/.test(query.slice(i - 2, i))) {
        return null;
      }
      const end = identifierEnd(query, i);
      if (end === -1) {
        return null;
      }
      out += query
        .slice(i + 1, end - 1)
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .replace(/""/g, "_")
        .replace(/\W/g, "_");
      i = end;
    } else if (
      ch === "$" &&
      /[A-Za-z_$]/.test(next ?? "") &&
      !/\w/.test(query[i - 1] ?? "")
    ) {
      const body = dollarBody(query, i);
      if (body === null) {
        return null;
      }
      out += ` ${body.text} `;
      i = body.end;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out.toLowerCase();
}

/**
 * Non-empty statements of normalized SQL, without leading parentheses. A DO
 * body's inner statements come out as separate entries, which is fine for a
 * guard that only asks more.
 * @param {string} sql
 * @returns {string[]}
 */
export function statements(sql) {
  return sql
    .split(";")
    .map((statement) => statement.trim().replace(/^[(\s]+/, ""))
    .filter(Boolean);
}

/**
 * First keyword of a normalized statement.
 * @param {string} statement
 */
export function firstWord(statement) {
  return /^[a-z]+/.exec(statement)?.[0] ?? "";
}

/**
 * Every `name(` or `schema.name(` in normalized SQL, skipping table and alias
 * column lists. A list on a network schema (`insert into net.http_request_queue (`)
 * is kept so it still counts as a send.
 * @param {string} sql
 * @param {Set<string>} keepSchemas
 * @returns {string[]}
 */
export function functionCalls(sql, keepSchemas) {
  return [
    ...sql.matchAll(
      /(?:\b([a-z_]+)\s+)?([a-z_][\w$]*(?:\s*\.\s*[a-z_][\w$]*)?)\s*\(/g,
    ),
  ]
    .map((match) => ({
      before: match[1] ?? "",
      call: match[2].replace(/\s+/g, ""),
    }))
    .filter(
      ({ before, call }) =>
        !NOT_A_CALL_BEFORE.has(before) || keepSchemas.has(call.split(".")[0]),
    )
    .map(({ call }) => call);
}

/**
 * Normalized text of the dollar-quoted body that starts at `start`, and the
 * index just past its closing tag. A `$` that opens no tag (`$name` without a
 * closing `$`) is kept as a plain character. Null when the body never closes
 * or cannot be read.
 * @returns {{ text: string, end: number } | null}
 */
function dollarBody(query, start) {
  const tag = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(query.slice(start))?.[0];
  if (!tag) {
    return { text: "$", end: start + 1 };
  }
  const bodyStart = start + tag.length;
  const close = query.indexOf(tag, bodyStart);
  if (close === -1) {
    return null;
  }
  const text = normalizeSql(query.slice(bodyStart, close));
  return text === null ? null : { text, end: close + tag.length };
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
