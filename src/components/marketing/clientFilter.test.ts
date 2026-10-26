import { expect, test } from "vitest";
import {
  ALL_CLIENTS_FILTER,
  applyClientFilter,
  clientFilterToParam,
  entryClientFilter,
  parseClientFilter,
  resolveCreativeListFilter,
} from "./clientFilter.ts";

test("entry to creative always uses every client", () => {
  expect(entryClientFilter("creative", null)).toBe(ALL_CLIENTS_FILTER);
  expect(entryClientFilter("creative", "client-1")).toBe(ALL_CLIENTS_FILTER);
  expect(entryClientFilter("copy", "client-1")).toBe("client-1");
  expect(entryClientFilter("copy", null)).toBe(null);
  expect(clientFilterToParam(entryClientFilter("creative", null))).toBe("all");
});

test("parseClientFilter maps a missing param to every client, not unassigned-only", () => {
  expect(parseClientFilter("all")).toBe(ALL_CLIENTS_FILTER);
  expect(parseClientFilter(null)).toBe(ALL_CLIENTS_FILTER);
  expect(parseClientFilter("")).toBe(ALL_CLIENTS_FILTER);
  expect(parseClientFilter("general")).toBe(null);
  expect(parseClientFilter("abc")).toBe("abc");
  expect(clientFilterToParam(null)).toBe("general");
  expect(clientFilterToParam(ALL_CLIENTS_FILTER)).toBe("all");
});

test("creative list filter never treats a missing client as unassigned-only", () => {
  expect(resolveCreativeListFilter(null)).toBe(ALL_CLIENTS_FILTER);
  expect(resolveCreativeListFilter(ALL_CLIENTS_FILTER)).toBe(
    ALL_CLIENTS_FILTER,
  );
  expect(resolveCreativeListFilter("client-1")).toBe("client-1");
});

test("applyClientFilter does not constrain the query for all clients", () => {
  const calls: string[] = [];
  const query = {
    eq(col: string, val: string) {
      calls.push(`eq:${col}:${val}`);
      return this;
    },
    is(col: string, val: null) {
      calls.push(`is:${col}:${val}`);
      return this;
    },
  };
  applyClientFilter(query, ALL_CLIENTS_FILTER);
  applyClientFilter(query, "client-1");
  applyClientFilter(query, null);
  expect(calls).toStrictEqual(["eq:client_id:client-1", "is:client_id:null"]);
});
