// A request inside a helper that sends whatever body it is given, such as
// `const send = (payload) => fetch(url, { body: …payload })`, is stamped
// by the helper's callers (AIO-261): the scan reads each call of the helper
// instead. Read from masked code (source-mask.ts); it runs nothing.
import { matchingCloser } from "./source-mask.ts";
import {
  bodyNames,
  IDENT,
  initializer,
  type Span,
  wordPattern,
} from "./stamp-value.ts";

/** The helper whose parameter the call passes on as its body, if any. */
export function passedOnHelper(code: string, call: Span): string | null {
  const parameters = bodyNames(code, call).filter(
    (name) => !initializer(code, name, call.open),
  );
  for (const name of parameters) {
    const helper = helperWithParam(code, name, call.open);
    if (helper) {
      return helper;
    }
  }
  return null;
}

/** Each direct call of the helper, its declaration aside. */
export function helperCalls(code: string, helper: string): Span[] {
  const use = new RegExp(`(?<!\\.)${wordPattern(helper).source}\\s*\\(`, "g");
  return [...code.matchAll(use)]
    .filter((m) => !/\bfunction\s*$/.test(code.slice(0, m.index)))
    .map((m) => m.index + m[0].length - 1)
    .map((open) => ({ open, close: matchingCloser(code, open) }));
}

/** The helper above, `const f = (…name…) =>` or `function f(…name…)`. */
function helperWithParam(
  code: string,
  name: string,
  before: number,
): string | null {
  const helper = new RegExp(
    `\\b(?:const|let)\\s+(${IDENT})\\s*=\\s*(?:async\\s*)?\\(([^)]*)\\)\\s*(?::[^=]*)?=>|\\bfunction\\s+(${IDENT})\\s*\\(([^)]*)\\)`,
    "g",
  );
  const param = wordPattern(name);
  const found = [...code.slice(0, before).matchAll(helper)]
    .filter((m) => param.test(m[2] ?? m[4] ?? ""))
    .at(-1);
  return found ? (found[1] ?? found[3]) : null;
}
