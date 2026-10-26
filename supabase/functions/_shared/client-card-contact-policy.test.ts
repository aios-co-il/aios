import assert from "node:assert/strict";
import test from "node:test";

import {
  HUMAN_REQUESTER_REQUIRED_HE,
  planCarmenClientUpdate,
  resolveHumanRequesterUserId,
} from "./client-card-contact-policy.ts";

const CAMPAIGNER_USER = "33333333-3333-4333-8333-333333333333";
const OWNER_USER = "44444444-4444-4444-8444-444444444444";

test("resolveHumanRequesterUserId: only a person talking to Carmen right now", () => {
  assert.equal(
    resolveHumanRequesterUserId({
      userId: CAMPAIGNER_USER,
      surface: "whatsapp",
    }),
    CAMPAIGNER_USER,
  );
  assert.equal(
    resolveHumanRequesterUserId({ userId: OWNER_USER, surface: "aios" }),
    OWNER_USER,
  );
  assert.equal(
    resolveHumanRequesterUserId({
      userId: OWNER_USER,
      surface: "internal_chat",
    }),
    OWNER_USER,
  );
  for (const surface of ["task", "grok_bot", "agent_direct", null])
    assert.equal(
      resolveHumanRequesterUserId({ userId: OWNER_USER, surface }),
      null,
      String(surface),
    );
  assert.equal(
    resolveHumanRequesterUserId({ userId: "system", surface: "internal_chat" }),
    null,
  );
  assert.equal(
    resolveHumanRequesterUserId({
      userId: CAMPAIGNER_USER,
      surface: "internal_chat",
      automationId: "auto-1",
    }),
    null,
  );
});

test("planCarmenClientUpdate: calls and meetings need a person and are attributed to them", () => {
  for (const updateType of ["call", "meeting", "CALL"]) {
    const refused = planCarmenClientUpdate({ updateType });
    assert.deepEqual(refused, {
      ok: false,
      error: "human_requester_required",
      message: HUMAN_REQUESTER_REQUIRED_HE,
    });
    const confirmed = planCarmenClientUpdate({
      updateType,
      humanRequesterUserId: CAMPAIGNER_USER,
    });
    assert.deepEqual(confirmed, {
      ok: true,
      updateType: updateType.toLowerCase(),
      source: "carmen_confirmed",
      attributedUserId: CAMPAIGNER_USER,
      countsAsContact: true,
    });
  }
});

test("planCarmenClientUpdate: other types never claim contact", () => {
  assert.deepEqual(planCarmenClientUpdate({}), {
    ok: true,
    updateType: "note",
    source: "carmen",
    attributedUserId: null,
    countsAsContact: null,
  });
  assert.deepEqual(
    planCarmenClientUpdate({
      updateType: "weekly_update",
      humanRequesterUserId: CAMPAIGNER_USER,
    }),
    {
      ok: true,
      updateType: "weekly_update",
      source: "carmen_confirmed",
      attributedUserId: CAMPAIGNER_USER,
      countsAsContact: null,
    },
  );
  assert.equal(
    planCarmenClientUpdate({ updateType: "complaint" }).ok &&
      (planCarmenClientUpdate({ updateType: "complaint" }) as any).source,
    "carmen",
  );
  const bad = planCarmenClientUpdate({ updateType: "email" });
  assert.equal(bad.ok, false);
  assert.equal((bad as any).error, "invalid_update_type");
});
