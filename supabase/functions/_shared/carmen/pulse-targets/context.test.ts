import { assertStrictEquals } from "jsr:@std/assert@1";

import { roleProblem } from "./context.ts";
import { ctx } from "./test-fixtures.ts";

Deno.test("managers, campaigners and role-less callers may set targets", () => {
  const notManager = { isManagerRole: false, isTeamManager: false };
  for (const caller of [
    { callerRole: "owner", isManagerRole: true },
    { ...notManager, callerRole: "team_manager", isTeamManager: true },
    { ...notManager, callerRole: "campaigner" },
    { ...notManager, callerRole: null },
  ]) {
    assertStrictEquals(roleProblem(ctx(caller)), null);
  }
  assertStrictEquals(
    roleProblem(ctx({ ...notManager, callerRole: "sales_person" }))?.error,
    "role_not_allowed",
  );
});
