import { assertEquals } from "jsr:@std/assert@1";
import { type GroupScopeGate, groupScopeGate } from "./group-scope.ts";

const DENIED: GroupScopeGate = {
  allowed: false,
  reason: "group_requires_explicit_scope",
};

const scope = (scopeMode: string, openMemberGroups = false) => ({
  scopeMode,
  openMemberGroups,
});

Deno.test("groupScopeGate", async (t) => {
  await t.step("denies a group under an all-scope automation", () => {
    assertEquals(groupScopeGate(scope("all"), {}, "own_instance"), DENIED);
  });

  await t.step("allows a specific_group scope on any channel", () => {
    assertEquals(
      groupScopeGate(scope("specific_group"), {}, "operator_mirror"),
      { allowed: true, openGroupStart: false },
    );
  });

  await t.step("allows open-member-groups on Carmen's own instance", () => {
    assertEquals(groupScopeGate(scope("all", true), {}, "own_instance"), {
      allowed: true,
      openGroupStart: true,
    });
    assertEquals(
      groupScopeGate(
        scope("all"),
        { carmen_open_member_groups: true },
        "own_instance",
      ),
      { allowed: true, openGroupStart: true },
    );
  });

  await t.step("denies open-member-groups on the operator mirror", () => {
    assertEquals(
      groupScopeGate(scope("all", true), {}, "operator_mirror"),
      DENIED,
    );
  });
});
