import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { USE_BRAIN_PICK } from "../_shared/carmen/brain-engine/stored-pick.ts";
import {
  withConsoleErrors,
  withConsoleLines,
} from "../_shared/testing/console-errors.ts";
import {
  type PickEngineResolvers,
  resolvePickAwareEngine,
  storedPickRequest,
} from "./stored-brain-pick.ts";
import {
  FOREIGN_AGENT,
  groq,
  LINE_OWNER,
  LINE_TENANT,
  lineAsks,
  lineChoices,
  resolvers,
  withoutPick,
} from "./stored-brain-pick.test-fixture.ts";

type Caller = Parameters<typeof storedPickRequest>[0];

const service: Caller = { kind: "service", userId: null };
const OWNER_LINE = `tenant ${LINE_TENANT}, line owner ${LINE_OWNER}`;
const OWNER_GROQ = `tenant ${LINE_TENANT}, brain "groq", line owner ${LINE_OWNER}`;
const DROPPED = `[stored-brain-pick] the stored brain was dropped (${OWNER_GROQ}):`;

/** The engine and the error log of one personal-line turn against `sb`. */
function lineTurn(
  sb: ReturnType<typeof lineChoices>,
  fakes: PickEngineResolvers,
  body: Record<string, unknown> = lineAsks,
) {
  return withConsoleErrors(() =>
    resolvePickAwareEngine(
      sb,
      service,
      body,
      () => Promise.resolve(true),
      fakes,
    ),
  );
}

/** The tables one turn read, in order. */
function tablesRead(sb: ReturnType<typeof lineChoices>) {
  return sb.queries.map((query) => query.table);
}

describe("storedPickRequest on a personal WhatsApp line (AIO-654)", () => {
  it("names the line owner's row for a service caller on the whatsapp surface", () => {
    assertEquals(storedPickRequest(service, lineAsks), {
      tenantId: LINE_TENANT,
      userId: LINE_OWNER,
      lineOwner: true,
    });
  });

  it("reads nothing for a service caller off WhatsApp or without a line owner", () => {
    for (const body of [
      { ...lineAsks, persona_user_id: undefined },
      { ...lineAsks, persona_user_id: "not-a-uuid" },
      { ...lineAsks, surface: "task" },
      { ...lineAsks, surface: undefined },
      { ...lineAsks, [USE_BRAIN_PICK]: undefined },
    ]) {
      assertStrictEquals(storedPickRequest(service, body), null);
    }
  });

  it("keeps a signed-in user on their own row even when the body names a line owner", () => {
    assertEquals(storedPickRequest({ kind: "user", userId: "u-1" }, lineAsks), {
      tenantId: LINE_TENANT,
      userId: "u-1",
      lineOwner: false,
    });
  });
});

describe("resolvePickAwareEngine on a personal WhatsApp line (AIO-654)", () => {
  it("runs the owner's stored brain under the owner's grants, read strictly, and says so", async () => {
    const { asked, pickedAs, fakes } = resolvers(groq);

    const { result: turn, logged } = await withConsoleLines("log", () =>
      lineTurn(lineChoices(true), fakes),
    );

    assertEquals(turn.result, { ...groq, fallbackInternal: true });
    assertEquals(pickedAs, [
      {
        auth: { kind: "user", userId: LINE_OWNER },
        options: { strictGrant: true },
      },
    ]);
    assertEquals(asked, [{ ...lineAsks, brain_slug: "groq" }]);
    assertStrictEquals(turn.logged, "");
    assertStrictEquals(
      logged,
      `[stored-brain-pick] a personal WhatsApp line runs on its owner's stored brain (${OWNER_GROQ})`,
    );
  });

  it("drops a brain the owner is not granted and runs as the service caller did", async () => {
    const callers: Array<Caller> = [];
    const { fakes } = resolvers({ kind: "denied" });
    const recording: PickEngineResolvers = {
      ...fakes,
      resolveWorkshopAwareEngine: (client, caller, body, allowed) => {
        callers.push(caller);
        return fakes.resolveWorkshopAwareEngine(client, caller, body, allowed);
      },
    };

    const { result: engine, logged } = await lineTurn(
      lineChoices(true),
      recording,
    );

    assertStrictEquals(engine, withoutPick);
    assertEquals(callers, [service]);
    assertStrictEquals(logged, `${DROPPED} denied`);
  });

  it("reads only the row, and logs nothing, when the owner stored no brain", async () => {
    for (const member of [true, false]) {
      const sb = lineChoices(member, {}, null);
      const { asked, fakes } = resolvers(groq);

      const { result: engine, logged } = await lineTurn(sb, fakes);

      assertStrictEquals(engine, withoutPick);
      assertEquals(asked, [lineAsks]);
      assertEquals(tablesRead(sb), ["carmen_user_choices"]);
      assertStrictEquals(logged, "");
    }
  });

  it("ignores the stored brain of an owner who left the organization", async () => {
    const sb = lineChoices(false);
    const { asked, fakes } = resolvers(groq);

    const { result: engine, logged } = await lineTurn(sb, fakes);

    assertStrictEquals(engine, withoutPick);
    assertEquals(asked, [lineAsks]);
    assertStrictEquals(
      logged,
      `${DROPPED} the line owner is not a member of the organization`,
    );
  });

  it("never resolves the pick in another organization's agent", async () => {
    const body = { ...lineAsks, agent_id: FOREIGN_AGENT };
    const { asked, fakes } = resolvers(groq);

    const { result: engine, logged } = await lineTurn(
      lineChoices(true),
      fakes,
      body,
    );

    assertStrictEquals(engine, withoutPick);
    assertEquals(asked, [body]);
    assertStrictEquals(
      logged,
      `${DROPPED} the turn's agent is not this organization's`,
    );
  });

  it("drops the pick when the row, membership or the agent cannot be read", async () => {
    for (const [table, message] of [
      [
        "carmen_user_choices",
        `[stored-brain-pick] carmen_user_choices read failed (${OWNER_LINE}): boom`,
      ],
      [
        "tenant_users",
        `${DROPPED} the line owner's membership or the turn's agent could not be read, tenant_users lookup failed: boom`,
      ],
      [
        "ai_agents",
        `${DROPPED} the line owner's membership or the turn's agent could not be read, ai_agents lookup failed: boom`,
      ],
    ]) {
      const { asked, fakes } = resolvers(groq);

      const { result: engine, logged } = await lineTurn(
        lineChoices(true, { [table]: "boom" }),
        fakes,
      );

      assertStrictEquals(engine, withoutPick);
      assertEquals(asked, [lineAsks]);
      assertStrictEquals(logged, message);
    }
  });

  it("drops a stored brain that cannot be resolved", async () => {
    const { fakes } = resolvers(new Error("connections read failed"));

    const { result: engine, logged } = await lineTurn(lineChoices(true), fakes);

    assertStrictEquals(engine, withoutPick);
    assertStrictEquals(
      logged,
      `[stored-brain-pick] the stored brain could not be resolved (${OWNER_GROQ}): connections read failed`,
    );
  });

  it("leaves a service turn without a line owner, and one that names a brain, as they were", async () => {
    for (const body of [
      { ...lineAsks, persona_user_id: undefined },
      { tenant_id: LINE_TENANT, surface: "whatsapp" },
      { ...lineAsks, brain_slug: "cursor" },
    ]) {
      const sb = lineChoices(true);
      const { asked, fakes } = resolvers(groq);

      const { result: engine, logged } = await lineTurn(sb, fakes, body);

      assertStrictEquals(engine, withoutPick);
      assertEquals(sb.queries, []);
      assertEquals(asked, [body]);
      assertStrictEquals(logged, "");
    }
  });
});
