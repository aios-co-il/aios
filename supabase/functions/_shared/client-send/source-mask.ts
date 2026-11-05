// The call-site scan's lexer (AIO-261): source text with comments, and the
// contents of strings, template literals and regular expressions, blanked,
// at the same indexes as the original, so brackets match the way the code
// nests them. Template expressions stay code without their `${` and `}`. It
// reads source text and runs nothing.

/** `plain`: comments blanked. `code`: literal contents blanked as well. */
export type MaskedSource = { plain: string; code: string };

/** A template literal, or code (the file itself or a `${…}` expression). */
type Frame = { template: boolean; braces: number };

/** After these a `/` starts a regular expression rather than a division. */
const BEFORE_REGEX =
  /^(?:|[-(,=:[!&|?{};+*%<>~^]|return|typeof|case|in|of|void|throw|new|delete|instanceof|do|else|yield|await)$/;

/** Masks one source file. */
export function maskSource(text: string): MaskedSource {
  const plain = text.split("");
  const code = text.split("");
  const blank = (from: number, to: number, comment: boolean) => {
    for (let k = from; k < Math.min(to, text.length); k++) {
      if (text[k] !== "\n") {
        code[k] = " ";
        if (comment) {
          plain[k] = " ";
        }
      }
    }
  };
  const frames: Frame[] = [{ template: false, braces: 0 }];
  let last = "";
  let i = 0;
  while (i < text.length) {
    const frame = frames[frames.length - 1];
    const c = text[i];
    const next = text[i + 1];
    if (frame.template) {
      if (c === "`") {
        frames.pop();
        last = "`";
        i += 1;
      } else if (c === "$" && next === "{") {
        blank(i, i + 2, false);
        frames.push({ template: false, braces: 0 });
        last = "{";
        i += 2;
      } else {
        const step = c === "\\" ? 2 : 1;
        blank(i, i + step, false);
        i += step;
      }
      continue;
    }
    if (c === "/" && (next === "/" || next === "*")) {
      const end =
        next === "/" ? endOf(text, "\n", i) : endOf(text, "*/", i + 2) + 2;
      blank(i, end, true);
      i = end;
    } else if (c === '"' || c === "'") {
      const end = literalEnd(text, i, c);
      blank(i + 1, end, false);
      last = c;
      i = end + 1;
    } else if (c === "`") {
      frames.push({ template: true, braces: 0 });
      i += 1;
    } else if (c === "/" && BEFORE_REGEX.test(last)) {
      const end = regexEnd(text, i);
      blank(i + 1, end, false);
      last = "/";
      i = end + 1;
    } else if (c === "}" && frame.braces === 0 && frames.length > 1) {
      blank(i, i + 1, false);
      frames.pop();
      i += 1;
    } else if (/[\w$]/.test(c)) {
      const end = wordEnd(text, i);
      last = text.slice(i, end);
      i = end;
    } else {
      frame.braces += c === "{" ? 1 : c === "}" ? -1 : 0;
      if (!/\s/.test(c)) {
        last = c;
      }
      i += 1;
    }
  }
  return { plain: plain.join(""), code: code.join("") };
}

/** Where `token` starts after `from`, or the end of the text. */
function endOf(text: string, token: string, from: number): number {
  const at = text.indexOf(token, from);
  return at < 0 ? text.length : at;
}

/** The closing quote of a string literal (or the line end, unterminated). */
function literalEnd(text: string, open: number, quote: string): number {
  let j = open + 1;
  while (j < text.length && text[j] !== quote && text[j] !== "\n") {
    j += text[j] === "\\" ? 2 : 1;
  }
  return Math.min(j, text.length);
}

/** The closing slash of a regular expression literal. */
function regexEnd(text: string, open: number): number {
  let inClass = false;
  let j = open + 1;
  while (j < text.length && text[j] !== "\n") {
    const ch = text[j];
    if (ch === "\\") {
      j += 2;
      continue;
    }
    if (ch === "/" && !inClass) {
      return j;
    }
    inClass = ch === "[" ? true : ch === "]" ? false : inClass;
    j += 1;
  }
  return Math.min(j, text.length);
}

/** The end of an identifier or number that starts at `from`. */
function wordEnd(text: string, from: number): number {
  let j = from;
  while (j < text.length && /[\w$]/.test(text[j])) {
    j += 1;
  }
  return j;
}

/** The innermost bracket of the masked code still open at `at`, or -1. */
export function enclosingOpener(code: string, at: number): number {
  let depth = 0;
  for (let i = at - 1; i >= 0; i--) {
    const c = code[i];
    if (")]}".includes(c)) {
      depth += 1;
    } else if ("([{".includes(c)) {
      if (depth === 0) {
        return i;
      }
      depth -= 1;
    }
  }
  return -1;
}

/** The bracket that closes the one at `open`. */
export function matchingCloser(code: string, open: number): number {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    depth += bracketStep(code[i]);
    if (depth === 0) {
      return i;
    }
  }
  return code.length;
}

/** The `;` (or closing bracket) that ends a statement starting at `from`. */
export function statementEnd(code: string, from: number): number {
  let depth = 0;
  for (let i = from; i < code.length; i++) {
    depth += bracketStep(code[i]);
    if (depth < 0 || (depth === 0 && code[i] === ";")) {
      return i;
    }
  }
  return code.length;
}

/** +1 for an opening bracket, -1 for a closing one. */
function bracketStep(c: string): number {
  return "([{".includes(c) ? 1 : ")]}".includes(c) ? -1 : 0;
}
