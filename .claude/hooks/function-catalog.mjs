/**
 * What the repo's migrations say about each SQL function, so the guard judges
 * repo functions by their definition instead of their name:
 * - readOnly: every definition is STABLE or IMMUTABLE and calls no repo
 *   function that may write. Requiring every definition covers an environment
 *   that still runs an older version.
 * - sends: a definition calls out of the database (pg_net, http, dblink,
 *   pgmq, cron scheduling, NOTIFY), directly or through another repo function.
 */
import { readdirSync, readFileSync } from "node:fs";

const CREATE_FUNCTION =
  /\bcreate\s+(?:or\s+replace\s+)?function\s+(?:"?[a-z_][\w$]*"?\s*\.\s*)?"?([a-z_][\w$]*)"?\s*\(/g;
const BODY_START = /\bas\s+(\$(?:[a-z_][a-z0-9_]*)?\$)/g;
// Calls that leave the database. Reading cron.job or net._http_response is not one.
const NETWORK_CALL =
  /\bnet\s*\.\s*http_|\bcron\s*\.\s*(?:schedule|unschedule|alter_job|schedule_in_database)\b|\bpgmq\s*\.\s*send|\bdblink(?:_exec)?\s*\(|\bhttp(?:_(?:get|post|put|patch|delete|head|request))?\s*\(|\bpg_notify\s*\(|\bnotify\s+[a-z_]/;
const CALL = /([a-z_][\w$]*)\s*\(/g;

/**
 * Reads every migration in `dir`. An unreadable directory gives an empty
 * catalog, so the guard falls back to name words: more prompts, never fewer.
 * @param {URL} dir
 * @returns {Map<string, { readOnly: boolean, sends: boolean }>}
 */
export function loadFunctionCatalog(dir) {
  try {
    const files = readdirSync(dir).filter((file) => file.endsWith(".sql"));
    return catalogFromSql(
      files.map((file) => readFileSync(new URL(file, dir), "utf8")),
    );
  } catch {
    return new Map();
  }
}

/**
 * Builds the catalog from migration texts.
 * @param {string[]} migrations
 * @returns {Map<string, { readOnly: boolean, sends: boolean }>}
 */
export function catalogFromSql(migrations) {
  const definitions = new Map();
  for (const sql of migrations) {
    for (const definition of functionDefinitions(sql.toLowerCase())) {
      const known = definitions.get(definition.name);
      definitions.set(
        definition.name,
        known ? mergeDefinitions(known, definition) : definition,
      );
    }
  }
  spreadThroughCalls(definitions);
  return new Map(
    [...definitions].map(([name, { readOnly, sends }]) => [
      name,
      { readOnly, sends },
    ]),
  );
}

/** Each CREATE FUNCTION in one lowercased migration. */
function* functionDefinitions(sql) {
  for (const match of sql.matchAll(CREATE_FUNCTION)) {
    const headerStart = match.index + match[0].length;
    const statementEnd = indexOrEnd(sql, ";", headerStart);
    BODY_START.lastIndex = headerStart;
    const body = BODY_START.exec(sql);
    if (!body || body.index > statementEnd) {
      // `AS 'text'` or BEGIN ATOMIC: read the whole statement as header and body.
      const text = sql.slice(headerStart, statementEnd);
      yield definition(match[1], text, text);
      continue;
    }
    const tag = body[1];
    const bodyStart = body.index + body[0].length;
    const bodyEnd = indexOrEnd(sql, tag, bodyStart);
    const trailerEnd = indexOrEnd(sql, ";", bodyEnd + tag.length);
    const options =
      sql.slice(headerStart, body.index) +
      sql.slice(bodyEnd + tag.length, trailerEnd);
    yield definition(match[1], options, sql.slice(bodyStart, bodyEnd));
  }
}

/** Facts from one definition's options (volatility) and body. */
function definition(name, options, body) {
  return {
    name,
    readOnly: /\b(stable|immutable)\b/.test(options),
    sends: NETWORK_CALL.test(body),
    calls: new Set([...body.matchAll(CALL)].map((match) => match[1])),
  };
}

/** One entry for a function defined more than once: the least safe of each fact. */
function mergeDefinitions(known, next) {
  return {
    name: known.name,
    readOnly: known.readOnly && next.readOnly,
    sends: known.sends || next.sends,
    calls: new Set([...known.calls, ...next.calls]),
  };
}

/** A function that calls a sending or writing repo function sends or writes too. */
function spreadThroughCalls(definitions) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const fn of definitions.values()) {
      for (const called of fn.calls) {
        const callee = definitions.get(called);
        if (!callee || callee === fn) {
          continue;
        }
        if (callee.sends && !fn.sends) {
          fn.sends = true;
          changed = true;
        }
        if (!callee.readOnly && fn.readOnly) {
          fn.readOnly = false;
          changed = true;
        }
      }
    }
  }
}

/** Index of `needle` at or after `from`, or the text length. */
function indexOrEnd(text, needle, from) {
  const index = text.indexOf(needle, from);
  return index === -1 ? text.length : index;
}
