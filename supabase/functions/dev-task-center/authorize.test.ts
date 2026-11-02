import { assertEquals, assertMatch } from "jsr:@std/assert@1";
import {
  type DevTaskCenterCaller,
  devTaskSendAuthorization,
} from "./authorize.ts";

const CURSOR_TASK = { assigned_agent: "cursor", requested_by_user_id: "ana" };
const CLAUDE_TASK = { assigned_agent: "claude", requested_by_user_id: "david" };

/** A signed-in person of the task's tenant; `over` changes what the handler found. */
const person = (
  over: Partial<Extract<DevTaskCenterCaller, { kind: "user" }>> = {},
): DevTaskCenterCaller => ({
  kind: "user",
  userId: "david",
  tenantAccess: true,
  tier: "full",
  ...over,
});

const status = (
  caller: DevTaskCenterCaller,
  task: Parameters<typeof devTaskSendAuthorization>[1],
) => {
  const verdict = devTaskSendAuthorization(caller, task);
  return verdict.ok ? 200 : verdict.status;
};

Deno.test("the service role and an allowed person may approve and send", () => {
  assertEquals(status({ kind: "service" }, CLAUDE_TASK), 200);
  assertEquals(status(person(), CLAUDE_TASK), 200);
  assertEquals(status(person(), CURSOR_TASK), 200);
  // Ana, on a Cursor bug fix she asked for.
  assertEquals(
    status(person({ userId: "ana", tier: "bugfix" }), CURSOR_TASK),
    200,
  );
});

Deno.test(
  "a person outside the tenant or without a dev tier is refused",
  () => {
    // A member of tenant A sends tenant B's task: no access to B.
    const outsider = devTaskSendAuthorization(
      person({ userId: "user-a", tenantAccess: false }),
      CURSOR_TASK,
    );
    assertEquals(outsider.ok ? 200 : outsider.status, 403);
    if (!outsider.ok) assertMatch(outsider.error, /דיוויד/);
    // A member of the tenant who may not escalate to coding agents.
    assertEquals(
      status(person({ userId: "member", tier: null }), CURSOR_TASK),
      403,
    );
    // A missing task tells an outsider nothing.
    assertEquals(status(person({ tenantAccess: false }), null), 403);
    assertEquals(status(person(), null), 404);
  },
);

Deno.test("a bug-fix caller sends only Cursor tasks they asked for", () => {
  const ana = person({ userId: "ana", tier: "bugfix" });
  const claude = devTaskSendAuthorization(ana, {
    ...CLAUDE_TASK,
    requested_by_user_id: "ana",
  });
  assertEquals(claude.ok ? 200 : claude.status, 403);
  if (!claude.ok) assertEquals(claude.code, "bugfix_cursor_only");
  const davids = devTaskSendAuthorization(ana, {
    ...CURSOR_TASK,
    requested_by_user_id: "david",
  });
  assertEquals(davids.ok ? 200 : davids.status, 403);
  if (!davids.ok) assertEquals(davids.code, "not_requester");
});
