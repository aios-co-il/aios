import { assertEquals } from "jsr:@std/assert@1";
import { whereConnectionUser } from "./connection-user-scope.ts";

Deno.test("whereConnectionUser matches a user id with eq", () => {
  const query = recordingQuery();

  whereConnectionUser(query, "user-1");

  assertEquals(query.calls, [["eq", "connection_user_id", "user-1"]]);
});

Deno.test("whereConnectionUser matches a missing user with is null", () => {
  const query = recordingQuery();

  whereConnectionUser(query, null);

  assertEquals(query.calls, [["is", "connection_user_id", null]]);
});

function recordingQuery() {
  const calls: Array<[string, string, string | null]> = [];
  const query = {
    calls,
    eq(column: "connection_user_id", value: string) {
      calls.push(["eq", column, value]);
      return query;
    },
    is(column: "connection_user_id", value: null) {
      calls.push(["is", column, value]);
      return query;
    },
  };
  return query;
}
