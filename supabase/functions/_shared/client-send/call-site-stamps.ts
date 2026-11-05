// Whether each call of a guarded sender names its sendKind (AIO-261): its
// arguments, the body variable or spread they pass, or every call of the
// helper that passes them on, must always carry one (stamp-value.ts). Read
// from masked source text (source-mask.ts); it runs nothing.
import {
  enclosingOpener,
  type MaskedSource,
  maskSource,
  matchingCloser,
} from "./source-mask.ts";
import { helperCalls, passedOnHelper } from "./helper-calls.ts";
import { argsStamped, IDENT, type Span, wordPattern } from "./stamp-value.ts";

/** One call of a guarded sender: its 1-based line, and whether it stamps. */
export type SenderCall = { line: number; stamped: boolean };

/** Words before `(` that open a statement, not a call. */
const NOT_CALLS = new Set(["if", "for", "while", "switch", "catch", "return"]);

/**
 * Every call of the named senders in the file: a literal functions/v1/<name>
 * URL, or, in a file that builds functions/v1/${…} URLs, a quoted name.
 */
export function senderCalls(text: string, senders: string[]): SenderCall[] {
  const src = maskSource(text);
  const stamps = new Map<number, boolean>();
  for (const site of senderSites(src, senders)) {
    for (const call of callsAt(src, site.at, site.literal)) {
      for (const [at, stamped] of stampedCalls(src.code, call, true)) {
        stamps.set(at, (stamps.get(at) ?? true) && stamped);
      }
    }
  }
  return [...stamps]
    .sort(([a], [b]) => a - b)
    .map(([at, stamped]) => ({ line: lineOf(text, at), stamped }));
}

/** Where the file names a sender: URLs, and quoted names if it builds URLs. */
function senderSites(src: MaskedSource, senders: string[]) {
  const names = senders.map((name) => name.replace(/[-$]/g, "\\$&")).join("|");
  const literal = new RegExp(`functions/v1/(?:${names})(?![\\w-])`, "g");
  const quoted = new RegExp(`["'\`](?:${names})["'\`]`, "g");
  const builds = src.plain.includes("functions/v1/${");
  return [
    ...[...src.plain.matchAll(literal)].map((m) => ({
      at: m.index,
      literal: true,
    })),
    ...(builds ? [...src.plain.matchAll(quoted)] : []).map((m) => ({
      at: m.index,
      literal: false,
    })),
  ];
}

/**
 * The request calls a site reaches: the call it sits in; else the requests
 * in its block that use the variable it is assigned to; else, for a quoted
 * name, every built URL request. A site that reaches none is one unstamped
 * call.
 */
function callsAt(src: MaskedSource, at: number, literal: boolean): Span[] {
  const call = enclosingCall(src.code, at);
  if (call) {
    return [call];
  }
  const viaVariable = variableRequests(src, at) ?? [];
  // A quoted name kept in a constant no request here names, such as
  // `export const SEND_FN = "send-x"`, reaches the built URL requests.
  const found =
    viaVariable.length > 0 || literal ? viaVariable : builtRequests(src);
  return found.length > 0 ? found : [{ open: at, close: at }];
}

/** The requests in its block that use the variable `at` is assigned to. */
function variableRequests(src: MaskedSource, at: number): Span[] | null {
  const block = enclosingOpener(src.code, at);
  const variable = declaredAt(src.code, at, block);
  if (!variable) {
    return null;
  }
  const close = block < 0 ? src.code.length : matchingCloser(src.code, block);
  return requestCalls(src, wordPattern(variable, "g"), { open: at, close });
}

/** Every request to a built functions/v1/${…} URL in the file. */
function builtRequests(src: MaskedSource): Span[] {
  const whole = { open: 0, close: src.code.length };
  return requestCalls(src, /functions\/v1\/\$\{/g, whole);
}

/** Fetch-like calls, or calls with a functions URL, the pattern hits. */
function requestCalls(src: MaskedSource, pattern: RegExp, within: Span) {
  const calls = new Map<number, Span>();
  for (const match of src.plain.slice(0, within.close).matchAll(pattern)) {
    const call =
      match.index >= within.open ? enclosingCall(src.code, match.index) : null;
    if (call && isRequest(src, call)) {
      calls.set(call.open, call);
    }
  }
  return [...calls.values()];
}

/** A fetch, or a call whose arguments hold a functions URL. */
function isRequest(src: MaskedSource, call: Span): boolean {
  return (
    /fetch$/i.test(calleeOf(src.code, call.open)) ||
    src.plain.slice(call.open, call.close).includes("functions/v1/")
  );
}

/**
 * [call index, stamped] for this call; when it passes on a helper's
 * parameter, for each call of that helper instead (one level).
 */
function stampedCalls(
  code: string,
  call: Span,
  followHelper: boolean,
): [number, boolean][] {
  if (argsStamped(code, call)) {
    return [[call.open, true]];
  }
  const helper = followHelper ? passedOnHelper(code, call) : null;
  return helper
    ? helperCalls(code, helper).flatMap((use) => stampedCalls(code, use, false))
    : [[call.open, false]];
}

/** The call whose argument list holds `at`, unless it is a statement. */
function enclosingCall(code: string, at: number): Span | null {
  const open = enclosingOpener(code, at);
  if (open < 0 || code[open] !== "(") {
    return null;
  }
  const callee = calleeOf(code, open);
  if (!callee || NOT_CALLS.has(callee)) {
    return null;
  }
  return { open, close: matchingCloser(code, open) };
}

/** The identifier right before a `(`, if any. */
function calleeOf(code: string, open: number): string {
  const before = code.slice(Math.max(0, open - 80), open);
  return /([\w$]+)\s*$/.exec(before)?.[1] ?? "";
}

/** The variable declared by the statement `at` sits in, inside `block`. */
function declaredAt(code: string, at: number, block: number): string | null {
  const declaration = new RegExp(
    `\\b(?:const|let|var)\\s+(${IDENT})\\s*(?::[^=;]*)?=[^;]*$`,
  );
  return declaration.exec(code.slice(block + 1, at))?.[1] ?? null;
}

/** The 1-based line of an index. */
function lineOf(text: string, at: number): number {
  return text.slice(0, at).split("\n").length;
}
