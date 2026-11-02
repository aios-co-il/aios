// Whether a request body always carries a sendKind (AIO-261), read from
// masked code (source-mask.ts): a sendKind key in an object that is not one
// branch of `?:`, `??`, `&&` or `||`; both branches of a ternary that do; or
// a variable or spread whose value does, followed a few levels.
import {
  enclosingOpener,
  matchingCloser,
  statementEnd,
} from "./source-mask.ts";

/** A range of the masked code: [open, close). */
export type Span = { open: number; close: number };

export const IDENT = "[A-Za-z_$][\\w$]*";

const STAMP_KEY = /(?<![.\w$])sendKind\s*(?=[:,}])/g;

const SPREAD = new RegExp(`\\.\\.\\.\\s*(${IDENT})\\b(?!\\s*[.(\\[])`, "g");

/** How many variables deep a body is followed. */
const MAX_DEPTH = 4;

/**
 * The call's arguments always carry a sendKind: a key, or a body passed as
 * JSON.stringify(x), body: x or ...x whose value does.
 */
export function argsStamped(code: string, call: Span): boolean {
  return (
    hasStamp(code, call) ||
    bodyNames(code, call).some((name) => nameStamped(code, name, call.open, 0))
  );
}

/** The identifiers a call passes on as its body. */
export function bodyNames(code: string, call: Span): string[] {
  const args = code.slice(call.open, call.close);
  const passed = [
    new RegExp(`JSON\\.stringify\\(\\s*(${IDENT})\\s*\\)`, "g"),
    new RegExp(`\\bbody\\s*:\\s*(${IDENT})\\b(?!\\s*[.(\\[])`, "g"),
  ].flatMap((re) => [...args.matchAll(re)].map((m) => m[1]));
  return [...passed, ...unconditional(code, call, SPREAD)];
}

/** The name as a whole word, `$` escaped. */
export function wordPattern(name: string, flags = ""): RegExp {
  const word = name.replace(/\$/g, "\\$");
  return new RegExp(`(?<![\\w$])${word}(?![\\w$])`, flags);
}

/** The nearest `const|let|var name = …;` before `before`: its value. */
export function initializer(
  code: string,
  name: string,
  before: number,
): Span | null {
  const declaration = new RegExp(
    `\\b(?:const|let|var)\\s+${wordPattern(name).source}\\s*(?::[^=;]*)?=`,
    "g",
  );
  const last = [...code.slice(0, before).matchAll(declaration)].at(-1);
  if (!last) {
    return null;
  }
  const open = last.index + last[0].length;
  return { open, close: statementEnd(code, open) };
}

/** The variable's nearest value always carries a sendKind. */
function nameStamped(
  code: string,
  name: string,
  before: number,
  depth: number,
): boolean {
  const value = initializer(code, name, before);
  return !!value && depth < MAX_DEPTH && valueStamped(code, value, depth + 1);
}

/** A key, both branches of a ternary, or a variable or spread that does. */
function valueStamped(code: string, value: Span, depth: number): boolean {
  if (hasStamp(code, value)) {
    return true;
  }
  const branches = ternaryBranches(code, value);
  if (branches) {
    return branches.every((branch) => valueStamped(code, branch, depth));
  }
  const text = code.slice(value.open, value.close).trim();
  const bare = new RegExp(`^(${IDENT})$`).exec(text);
  const names = bare ? [bare[1]] : unconditional(code, value, SPREAD);
  return names.some((name) => nameStamped(code, name, value.open, depth));
}

/** A sendKind key, always set, inside the span. */
function hasStamp(code: string, span: Span): boolean {
  return unconditional(code, span, STAMP_KEY).length > 0;
}

/**
 * Matches (their first group, else the match) inside an object literal of
 * the span that is not one branch of a condition.
 */
function unconditional(code: string, span: Span, pattern: RegExp): string[] {
  const text = code.slice(span.open, span.close);
  return [...text.matchAll(pattern)]
    .filter((match) => {
      const open = enclosingOpener(code, span.open + match.index);
      return (
        open >= span.open && code[open] === "{" && !isBranch(code, open, span)
      );
    })
    .map((match) => match[1] ?? match[0]);
}

/** `cond ? a : b` at the top level of the span: a and b. */
function ternaryBranches(code: string, span: Span): Span[] | null {
  let question = -1;
  let nested = 0;
  for (let i = span.open; i < span.close; i++) {
    const c = code[i];
    if ("([{".includes(c)) {
      i = matchingCloser(code, i);
    } else if (isTernaryMark(code, i)) {
      nested += question < 0 ? 0 : 1;
      question = question < 0 ? i : question;
    } else if (c === ":" && question >= 0) {
      if (nested === 0) {
        return [
          { open: question + 1, close: i },
          { open: i + 1, close: span.close },
        ];
      }
      nested -= 1;
    }
  }
  return null;
}

/** A ternary's `?`: not part of `??` or `?.`. */
function isTernaryMark(code: string, i: number): boolean {
  return (
    code[i] === "?" && !"?.".includes(code[i + 1] ?? "") && code[i - 1] !== "?"
  );
}

/** The object at `open` is one branch of `?:`, `??`, `&&` or `||`. */
function isBranch(code: string, open: number, span: Span): boolean {
  let depth = 0;
  for (let i = open - 1; i >= span.open; i--) {
    const c = code[i];
    if (")]}".includes(c)) {
      depth += 1;
    } else if ("([{".includes(c)) {
      if (depth === 0) {
        return false;
      }
      depth -= 1;
    } else if (depth > 0) {
      continue;
    } else if (c === ";" || c === "," || isAssignment(code, i)) {
      return false;
    } else if (c === "?" && code[i + 1] !== ".") {
      return true;
    } else if ((c === "&" || c === "|") && code[i - 1] === c) {
      return true;
    }
  }
  return false;
}

/** A plain `=`, not `==`, `!=`, `<=`, `>=` or `=>`. */
function isAssignment(code: string, i: number): boolean {
  return (
    code[i] === "=" &&
    !"=!<>".includes(code[i - 1]) &&
    !"=>".includes(code[i + 1])
  );
}
