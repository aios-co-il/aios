import { assertStrictEquals } from "jsr:@std/assert@1";

import { roleProblem } from "./context.ts";
import { ctx } from "./test-fixtures.ts";

Deno.test(
  "managers, campaigners and runs with no person may set targets",
  () => {
    const notManager = { isManagerRole: false, isTeamManager: false };
    for (const caller of [
      { callerRole: "owner", isManagerRole: true },
      { ...notManager, callerRole: "team_manager", isTeamManager: true },
      { ...notManager, callerRole: "campaigner" },
      { ...notManager, callerRole: null, actorUserId: null },
    ]) {
      assertStrictEquals(roleProblem(ctx(caller)), null);
    }
    for (const caller of [
      { ...notManager, callerRole: "sales_person" },
      { ...notManager, callerRole: null, actorUserId: "user-without-role" },
    ]) {
      assertStrictEquals(roleProblem(ctx(caller))?.error, "role_not_allowed");
    }
  },
);
