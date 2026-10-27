import { assertStrictEquals } from "jsr:@std/assert@1";

import { roleProblem } from "./context.ts";
import { ctx } from "./test-fixtures.ts";

Deno.test("managers, campaigners and role-less callers may set targets", () => {
  for (const callerRole of ["owner", "team_manager", "campaigner", null]) {
    assertStrictEquals(roleProblem(ctx({ callerRole })), null);
  }
  assertStrictEquals(
    roleProblem(ctx({ callerRole: "sales_person" }))?.error,
    "role_not_allowed",
  );
});
