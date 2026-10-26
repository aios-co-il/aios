import assert from "node:assert/strict";
import { test } from "node:test";
import { isBlockedInWorkshop } from "./blocked-tools.ts";

test("approval tools are blocked inside the workshop only", () => {
  for (const name of [
    "execute_pending_approval",
    "reject_pending_approval",
    "list_pending_approvals",
  ]) {
    assert.equal(isBlockedInWorkshop(name, true), true);
    assert.equal(isBlockedInWorkshop(name, false), false);
  }
});

test("ordinary tools are never blocked", () => {
  assert.equal(isBlockedInWorkshop("workshop_get_state", true), false);
  assert.equal(isBlockedInWorkshop("search_agent_tools", true), false);
});
