import assert from "node:assert/strict";
import test from "node:test";

import {
  isClientCallUpdate,
  resolveClientUpdateType,
} from "./clientUpdateType.ts";
import {
  canModifyClientUpdate,
  clientUpdateSourceFilterKey,
  matchesClientUpdateSourceFilter,
} from "./clientUpdateSource.ts";

const CALL_NOTE = "דיברתי עם הלקוח בטלפון על התקציב";

test("a person's weekly update that documents a call becomes a call", () => {
  assert.equal(resolveClientUpdateType("weekly_update", CALL_NOTE), "call");
  assert.equal(
    resolveClientUpdateType("weekly_update", CALL_NOTE, "human"),
    "call",
  );
  assert.equal(
    resolveClientUpdateType("weekly_update", "לא הצלחתי לדבר עם הלקוח"),
    "weekly_update",
  );
});

test("entries no person typed are never reclassified as calls", () => {
  for (const source of [
    "carmen",
    "carmen_confirmed",
    "system_send",
    "group_digest",
    "automation",
  ])
    assert.equal(
      resolveClientUpdateType("weekly_update", CALL_NOTE, source),
      "weekly_update",
      source,
    );
});

test("contact counting mirrors get_latest_client_call_updates", () => {
  assert.equal(isClientCallUpdate("call", "x"), true);
  assert.equal(isClientCallUpdate("call", "x", "human"), true);
  assert.equal(isClientCallUpdate("weekly_update", CALL_NOTE, null), true);
  assert.equal(
    isClientCallUpdate("weekly_update", CALL_NOTE, "carmen_confirmed"),
    true,
  );
  assert.equal(
    isClientCallUpdate("meeting", "פגישה", "carmen_confirmed", true),
    true,
  );
  // Plain meetings keep today's rule.
  assert.equal(isClientCallUpdate("meeting", "פגישה", "human"), false);
  // Automatic sources never count, even with the flag or call text.
  assert.equal(isClientCallUpdate("call", "x", "carmen"), false);
  assert.equal(
    isClientCallUpdate("weekly_update", CALL_NOTE, "system_send"),
    false,
  );
  assert.equal(isClientCallUpdate("call", "x", "group_digest", true), false);
  assert.equal(isClientCallUpdate("call", "x", "automation"), false);
});

test("source filter groups Carmen's two sources and treats legacy rows as human", () => {
  assert.equal(clientUpdateSourceFilterKey(null), "human");
  assert.equal(clientUpdateSourceFilterKey("human"), "human");
  assert.equal(clientUpdateSourceFilterKey("carmen"), "carmen");
  assert.equal(clientUpdateSourceFilterKey("carmen_confirmed"), "carmen");
  assert.equal(clientUpdateSourceFilterKey("system_send"), "system_send");
  assert.equal(matchesClientUpdateSourceFilter("automation", "all"), true);
  assert.equal(
    matchesClientUpdateSourceFilter("carmen_confirmed", "carmen"),
    true,
  );
  assert.equal(matchesClientUpdateSourceFilter(undefined, "human"), true);
  assert.equal(matchesClientUpdateSourceFilter("carmen", "human"), false);
});

test("automatic entries are edited only by owners; own human notes by their author", () => {
  const me = "user-1";
  assert.equal(
    canModifyClientUpdate({
      source: "human",
      rowUserId: me,
      currentUserId: me,
      canManageAutomaticEntries: false,
    }),
    true,
  );
  assert.equal(
    canModifyClientUpdate({
      source: null,
      rowUserId: "someone-else",
      currentUserId: me,
      canManageAutomaticEntries: true,
    }),
    false,
  );
  // A Carmen entry attributed to the campaigner is still not theirs to edit.
  assert.equal(
    canModifyClientUpdate({
      source: "carmen_confirmed",
      rowUserId: me,
      currentUserId: me,
      canManageAutomaticEntries: false,
    }),
    false,
  );
  assert.equal(
    canModifyClientUpdate({
      source: "system_send",
      rowUserId: "someone-else",
      currentUserId: me,
      canManageAutomaticEntries: true,
    }),
    true,
  );
});
