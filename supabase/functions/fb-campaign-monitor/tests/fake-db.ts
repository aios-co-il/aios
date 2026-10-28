/**
 * Recording stand-in for the Supabase client in the monitor's Deno tests. Each
 * query is answered by `answer` once it is awaited (or ends in maybeSingle /
 * single) with everything the chain recorded.
 */
import type { DbClient } from "../../_shared/supabase-clients.ts";

export type FakeCall = {
  table: string;
  op: "select" | "update" | "insert";
  columns?: string;
  values?: unknown;
  filters: string[];
  single: boolean;
};

export type FakeAnswer = { data: unknown; error: { message: string } | null };

export function fakeDb(answer: (call: FakeCall) => FakeAnswer) {
  const calls: FakeCall[] = [];
  const from = (table: string) => {
    const call: FakeCall = { table, op: "select", filters: [], single: false };
    const finish = () => {
      calls.push(call);
      return Promise.resolve(answer(call));
    };
    const filter = (text: string) => {
      call.filters.push(text);
      return chain;
    };
    const chain = {
      select: (columns?: string) => {
        if (call.op === "select") call.columns = columns;
        return chain;
      },
      update: (values: unknown) => {
        call.op = "update";
        call.values = values;
        return chain;
      },
      insert: (values: unknown) => {
        call.op = "insert";
        call.values = values;
        return chain;
      },
      eq: (column: string, value: unknown) => filter(`${column}=${value}`),
      in: (column: string, values: unknown[]) =>
        filter(`${column} in ${values.join(",")}`),
      is: (column: string, value: unknown) => filter(`${column} is ${value}`),
      not: (column: string, op: string, value: unknown) =>
        filter(`${column} not ${op} ${value}`),
      gte: (column: string, value: unknown) => filter(`${column}>=${value}`),
      order: () => chain,
      limit: () => chain,
      maybeSingle: () => {
        call.single = true;
        return finish();
      },
      single: () => {
        call.single = true;
        return finish();
      },
      then: (
        ok: (value: FakeAnswer) => unknown,
        fail?: (error: unknown) => unknown,
      ) => finish().then(ok, fail),
    };
    return chain;
  };
  // The fake implements only the builder calls the monitor makes; typing it as
  // the client lets the tests pass it where the monitor takes one.
  const db = { from } as unknown as Pick<DbClient, "from">;
  return { db, calls };
}
