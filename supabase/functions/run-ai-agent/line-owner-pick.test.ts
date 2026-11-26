import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { withConsoleErrors } from "../_shared/testing/console-errors.ts";
import { bindRunAgentCaller } from "./caller-trust.ts";
import { lineOwnerMayPick, personalLineOwner } from "./line-owner-pick.ts";
import {
  FOREIGN_AGENT,
  LINE_AGENT,
  LINE_OWNER,
  LINE_TENANT,
  lineAsks,
  lineChoices,
} from "./stored-brain-pick.test-fixture.ts";

const owner = { tenantId: LINE_TENANT, userId: LINE_OWNER };
const STORED = "the line's label";
const DROPPED = `[stored-brain-pick] the stored brain was dropped (${STORED}):`;

/** Whether the owner's pick may run on a turn with `agentId`, and the error log. */
function mayPick(sb: ReturnType<typeof lineChoices>, agentId: unknown) {
  return withConsoleErrors(() => lineOwnerMayPick(sb, owner, agentId, STORED));
}

describe("personalLineOwner", () => {
  it("is the persona user of a whatsapp turn, and nobody otherwise", () => {
    assertStrictEquals(personalLineOwner(lineAsks), LINE_OWNER);
    for (const body of [
      { surface: "whatsapp" },
      { surface: "whatsapp", persona_user_id: "system" },
      { surface: "task", persona_user_id: LINE_OWNER },
      { persona_user_id: LINE_OWNER },
      null,
    ]) {
      assertStrictEquals(personalLineOwner(body), null);
    }
  });

  it("is never named by a signed-in user's request", () => {
    const body = bindRunAgentCaller(
      { ...lineAsks },
      { kind: "user", userId: "u-1" },
    );

    assertStrictEquals(personalLineOwner(body), null);
  });
});

describe("lineOwnerMayPick", () => {
  it("lets a member's pick run on the organization's own agent, or on none", async () => {
    for (const agentId of [LINE_AGENT, undefined, null, ""]) {
      const sb = lineChoices(true);

      const { result: may, logged } = await mayPick(sb, agentId);

      assertStrictEquals(may, true);
      assertStrictEquals(logged, "");
      assertEquals(
        sb.queries.map((query) => query.table),
        agentId ? ["tenant_users", "ai_agents"] : ["tenant_users"],
      );
    }
  });

  it("drops the pick of an owner who left the organization", async () => {
    const { result: may, logged } = await mayPick(
      lineChoices(false),
      LINE_AGENT,
    );

    assertStrictEquals(may, false);
    assertStrictEquals(
      logged,
      `${DROPPED} the line owner is not a member of the organization`,
    );
  });

  it("drops the pick when the turn's agent is another organization's, unknown or malformed", async () => {
    for (const agentId of [
      FOREIGN_AGENT,
      "55555555-5555-4555-8555-555555555555",
      "not-a-uuid",
      7,
    ]) {
      const { result: may, logged } = await mayPick(lineChoices(true), agentId);

      assertStrictEquals(may, false);
      assertStrictEquals(
        logged,
        `${DROPPED} the turn's agent is not this organization's`,
      );
    }
  });

  it("drops the pick when membership or the agent cannot be read", async () => {
    for (const [table, message] of [
      ["tenant_users", "tenant_users lookup failed: boom"],
      ["ai_agents", "ai_agents lookup failed: boom"],
    ]) {
      const { result: may, logged } = await mayPick(
        lineChoices(true, { [table]: "boom" }),
        LINE_AGENT,
      );

      assertStrictEquals(may, false);
      assertStrictEquals(
        logged,
        `${DROPPED} the line owner's membership or the turn's agent could not be read, ${message}`,
      );
    }
  });
});
