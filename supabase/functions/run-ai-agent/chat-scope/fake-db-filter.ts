// PostgREST's logic-tree grammar (and(...), or(...), col.[not.]op.value), so a
// fake query runs the exact or() string the chat scope would send.

type Row = Record<string, unknown>;

export type FilterNode =
  | { kind: "and" | "or"; items: FilterNode[] }
  | { kind: "cond"; col: string; not: boolean; op: string; value: string };

/** Parses the argument of supabase-js .or(): a comma list under an implicit or(). */
export function parseOrFilter(value: string): FilterNode {
  const [items, end] = parseList(value, 0);
  if (end !== value.length) {
    throw new Error(`trailing input: ${value}`);
  }

  return { kind: "or", items };
}

/** Whether a row passes a parsed filter tree. */
export function evalFilter(row: Row, node: FilterNode): boolean {
  if (node.kind === "cond") {
    return evalCond(row, node);
  }

  if (node.kind === "and") {
    return node.items.every((n) => evalFilter(row, n));
  }

  return node.items.some((n) => evalFilter(row, n));
}

/** A case-insensitive regex for a LIKE pattern (* or % as wildcards). */
export function likeToRegex(pattern: string): RegExp {
  const body = pattern
    .split(/[*%]/)
    .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}$`, "i");
}

/** One value: a parenthesised list or text up to the next , or ). */
function readValue(s: string, i: number): [string, number] {
  if (s[i] === "(") {
    const end = s.indexOf(")", i);
    return [s.slice(i, end + 1), end + 1];
  }

  let j = i;
  while (j < s.length && s[j] !== "," && s[j] !== ")") {
    j += 1;
  }

  return [s.slice(i, j), j];
}

/** One and(...)/or(...) group or col.[not.]op.value condition at `i`. */
function parseExpr(s: string, i: number): [FilterNode, number] {
  const groups: ("and" | "or")[] = ["and", "or"];
  for (const kind of groups) {
    if (s.startsWith(`${kind}(`, i)) {
      const [items, next] = parseList(s, i + kind.length + 1);
      if (s[next] !== ")") {
        throw new Error(`unclosed ${kind}( at ${i}: ${s}`);
      }

      return [{ kind, items }, next + 1];
    }
  }

  const dot = s.indexOf(".", i);
  const col = s.slice(i, dot);
  const not = s.startsWith("not.", dot + 1);
  const j = dot + 1 + (not ? 4 : 0);
  const opEnd = s.indexOf(".", j);
  const op = s.slice(j, opEnd);
  const [value, next] = readValue(s, opEnd + 1);
  if (!col || !op) {
    throw new Error(`bad condition at ${i}: ${s}`);
  }

  return [{ kind: "cond", col, not, op, value }, next];
}

/** A comma-separated list of expressions starting at `i`. */
function parseList(s: string, i: number): [FilterNode[], number] {
  const items: FilterNode[] = [];
  let pos = i;
  for (;;) {
    const [node, next] = parseExpr(s, pos);
    items.push(node);
    if (s[next] !== ",") {
      return [items, next];
    }

    pos = next + 1;
  }
}

/** SQL-style: comparisons with NULL are not true. */
function evalCond(row: Row, c: Extract<FilterNode, { kind: "cond" }>): boolean {
  const v = row[c.col];
  if (c.op === "is") {
    const result = c.value === "null" ? v == null : false;
    return c.not ? !result : result;
  }

  if (v == null) {
    return false;
  }

  const result = matchesOp(String(v), c);
  return c.not ? !result : result;
}

/** eq / neq / in / ilike on a non-null value. */
function matchesOp(
  v: string,
  c: Extract<FilterNode, { kind: "cond" }>,
): boolean {
  if (c.op === "eq") {
    return v === c.value;
  }

  if (c.op === "neq") {
    return v !== c.value;
  }

  if (c.op === "in") {
    return c.value.slice(1, -1).split(",").filter(Boolean).includes(v);
  }

  if (c.op === "ilike") {
    return likeToRegex(c.value).test(v);
  }

  throw new Error(`unsupported op ${c.op}`);
}
