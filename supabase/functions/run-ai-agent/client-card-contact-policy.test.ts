import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import {
  HUMAN_REQUESTER_REQUIRED_HE,
  planCarmenClientUpdate,
  resolveHumanRequesterUserId,
} from "./client-card-contact-policy.ts";

const CAMPAIGNER_USER = "33333333-3333-4333-8333-333333333333";
const OWNER_USER = "44444444-4444-4444-8444-444444444444";

Deno.test(
  "resolveHumanRequesterUserId: only a person talking to Carmen right now",
  () => {
    assertStrictEquals(
      resolveHumanRequesterUserId({
        userId: CAMPAIGNER_USER,
        surface: "whatsapp",
      }),
      CAMPAIGNER_USER,
    );
    assertStrictEquals(
      resolveHumanRequesterUserId({ userId: OWNER_USER, surface: "aios" }),
      OWNER_USER,
    );
    assertStrictEquals(
      resolveHumanRequesterUserId({
        userId: OWNER_USER,
        surface: "internal_chat",
      }),
      OWNER_USER,
    );
    for (const surface of ["task", "grok_bot", "agent_direct", null]) {
      assertStrictEquals(
        resolveHumanRequesterUserId({ userId: OWNER_USER, surface }),
        null,
        String(surface),
      );
    }
    assertStrictEquals(
      resolveHumanRequesterUserId({
        userId: "system",
        surface: "internal_chat",
      }),
      null,
    );
    assertStrictEquals(
      resolveHumanRequesterUserId({
        userId: CAMPAIGNER_USER,
        surface: "internal_chat",
        automationId: "auto-1",
      }),
      null,
    );
  },
);

Deno.test(
  "planCarmenClientUpdate: calls and meetings need a person and are attributed to them",
  () => {
    for (const updateType of ["call", "meeting", "CALL"]) {
      const refused = planCarmenClientUpdate({ updateType });
      assertEquals(refused, {
        ok: false,
        error: "human_requester_required",
        message: HUMAN_REQUESTER_REQUIRED_HE,
      });
      const confirmed = planCarmenClientUpdate({
        updateType,
        humanRequesterUserId: CAMPAIGNER_USER,
      });
      assertEquals(confirmed, {
        ok: true,
        updateType: updateType.toLowerCase(),
        source: "carmen_confirmed",
        attributedUserId: CAMPAIGNER_USER,
        countsAsContact: true,
      });
    }
  },
);

Deno.test("planCarmenClientUpdate: other types never claim contact", () => {
  assertEquals(planCarmenClientUpdate({}), {
    ok: true,
    updateType: "note",
    source: "carmen",
    attributedUserId: null,
    countsAsContact: null,
  });

  assertEquals(
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

  const complaint = planCarmenClientUpdate({ updateType: "complaint" });
  assert(complaint.ok);
  assertStrictEquals(complaint.source, "carmen");

  const bad = planCarmenClientUpdate({ updateType: "email" });
  assert(!bad.ok);
  assertStrictEquals(bad.error, "invalid_update_type");
});
