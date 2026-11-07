import { assertEquals } from "jsr:@std/assert@1";
import { connectionUserFilter } from "./connection-user-filter.ts";

Deno.test("connectionUserFilter matches a connected user with eq", () => {
  assertEquals(connectionUserFilter("user-1"), [
    "connection_user_id",
    "eq",
    "user-1",
  ]);
});

Deno.test(
  "connectionUserFilter matches an integration without a user with is null",
  () => {
    assertEquals(connectionUserFilter(null), [
      "connection_user_id",
      "is",
      null,
    ]);
  },
);
