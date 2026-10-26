/**
 * Minimal in-memory stand-in for the supabase-js query builder, for node:test.
 * Supports select/insert with eq, neq, in, order, limit, maybeSingle, single
 * and await. Every query is recorded in `queries` so tests can assert what
 * was asked (for example, which integration types were requested).
 * A plain column list in select() is honoured: rows come back with only those
 * columns, so code that forgets to select a column it reads fails its test.
 */
export function fakeSupabase(tables = {}, { rpc = {}, users = {} } = {}) {
  const queries = [];
  const inserts = [];

  function from(table) {
    const q = { table, filters: [], order: null, limit: null };
    queries.push(q);
    const rows = () => {
      let out = (tables[table] || []).filter((row) =>
        q.filters.every(([op, col, val]) => {
          if (op === "eq") return row[col] === val;
          if (op === "neq") return row[col] !== val;
          if (op === "in") return val.includes(row[col]);
          return true;
        }),
      );
      if (q.order) {
        const { col, asc } = q.order;
        out = [...out].sort((a, b) => {
          const x = a[col] ?? "";
          const y = b[col] ?? "";
          if (x === y) return 0;
          return (x < y ? -1 : 1) * (asc ? 1 : -1);
        });
      }
      if (q.limit != null) out = out.slice(0, q.limit);
      return out.map(project);
    };
    const project = (row) => {
      const cols = q.columns;
      if (typeof cols !== "string" || cols.trim() === "*" || /[()]/.test(cols))
        return row;
      const picked = {};
      for (const col of cols.split(",").map((c) => c.trim())) {
        if (col && col in row) picked[col] = row[col];
      }
      return picked;
    };
    const builder = {
      select(columns) {
        q.columns = columns;
        return builder;
      },
      insert(payload) {
        const list = Array.isArray(payload) ? payload : [payload];
        inserts.push({ table, rows: list });
        (tables[table] ||= []).push(...list);
        return Promise.resolve({ data: null, error: null });
      },
      eq(col, val) {
        q.filters.push(["eq", col, val]);
        return builder;
      },
      neq(col, val) {
        q.filters.push(["neq", col, val]);
        return builder;
      },
      in(col, vals) {
        q.filters.push(["in", col, vals]);
        return builder;
      },
      order(col, opts = {}) {
        q.order = { col, asc: opts.ascending !== false };
        return builder;
      },
      limit(n) {
        q.limit = n;
        return builder;
      },
      maybeSingle() {
        return Promise.resolve({ data: rows()[0] ?? null, error: null });
      },
      single() {
        return builder.maybeSingle();
      },
      then(resolve, reject) {
        return Promise.resolve({ data: rows(), error: null }).then(
          resolve,
          reject,
        );
      },
    };
    return builder;
  }

  return {
    from,
    queries,
    inserts,
    async rpc(name, args) {
      const fn = rpc[name];
      return { data: fn ? fn(args) : null, error: null };
    },
    auth: {
      async getUser(token) {
        const id = users[token];
        return id
          ? { data: { user: { id } }, error: null }
          : { data: { user: null }, error: { message: "invalid token" } };
      },
    },
  };
}

/** Records fetch calls and answers each with the next scripted response. */
export function fakeFetch(responses = []) {
  const calls = [];
  const queue = [...responses];
  const impl = async (url, init = {}) => {
    calls.push({ url: String(url), body: JSON.parse(init.body || "{}"), init });
    const next = queue.length > 1 ? queue.shift() : queue[0];
    const { status = 200, body = { success: true, messageId: "m1" } } =
      next || {};
    return new Response(JSON.stringify(body), { status });
  };
  return { impl, calls };
}
