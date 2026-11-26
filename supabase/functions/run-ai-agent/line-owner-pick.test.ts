import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { USE_BRAIN_PICK } from "../_shared/carmen/brain-engine/stored-pick.ts";
import { withConsoleErrors } from "../_shared/testing/console-errors.ts";
import { fakeSupabase } from "../_shared/testing/fake-supabase.ts";
import { bindRunAgentCaller } from "./caller-trust.ts";
import { personalLineOwner } from "./line-owner-pick.ts";
import {
  type PickEngineResolvers,
  resolvePickAwareEngine,
  storedPickRequest,
} from "./stored-brain-pick.ts";
import {
  groq,
  resolvers,
  withoutPick,
} from "./stored-brain-pick.test-fixture.ts";

type Caller = Parameters<typeof storedPickRequest>[0];

const LINE_TENANT = "11111111-1111-4111-8111-111111111111";
const LINE_OWNER = "22222222-2222-4222-8222-222222222222";
const service: Caller = { kind: "service", userId: null };
/** What runCarmenAI sends for a turn on a personal WhatsApp line. */
const lineAsks = {
  [USE_BRAIN_PICK]: true,
  tenant_id: LINE_TENANT,
  surface: "whatsapp",
  persona_user_id: LINE_OWNER,
};
const OWNER_LINE = `tenant ${LINE_TENANT}, line owner ${LINE_OWNER}`;
const OWNER_GROQ = `tenant ${LINE_TENANT}, brain "groq", line owner ${LINE_OWNER}`;

/**
 * The line owner's stored "groq" in their organization; `member` says whether
 * they still belong to it, and `failing` names a table whose reads fail.
 */
function lineChoices(member: boolean, failing: Record<string, string> = {}) {
  return fakeSupabase(
    {
      tenant_users: member
        ? [{ tenant_id: LINE_TENANT, user_id: LINE_OWNER }]
        : [{ tenant_id: "t-2", user_id: LINE_OWNER }],
      carmen_user_choices: [
        { tenant_id: LINE_TENANT, user_id: LINE_OWNER, brain_slug: "groq" },
      ],
    },
    { failing },
  );
}

/** Runs `fn` with console.log recorded, for the line an applied pick leaves. */
async function withConsoleLogs<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; logged: string }> {
  const lines: Array<string> = [];
  const original = console.log;
  console.log = (...args: Array<unknown>) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    return { result: await fn(), logged: lines.join("\n") };
  } finally {
    console.log = original;
  }
}

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
    assertStrictEquals(
      storedPickRequest({ kind: "user", userId: "u-1" }, body)?.lineOwner,
      false,
    );
  });
});

describe("a personal WhatsApp line (AIO-654)", () => {
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

  it("runs the owner's stored brain under the owner's grants and says so", async () => {
    const callers: Array<Caller> = [];
    const { asked, fakes } = resolvers(groq);
    const asOwner: PickEngineResolvers = {
      ...fakes,
      resolveBrainEngine: (client, caller, body) => {
        callers.push(caller);
        return fakes.resolveBrainEngine(client, caller, body);
      },
    };

    const { result: turn, logged } = await withConsoleLogs(() =>
      lineTurn(lineChoices(true), asOwner),
    );

    assertEquals(turn.result, { ...groq, fallbackInternal: true });
    assertEquals(callers, [{ kind: "user", userId: LINE_OWNER }]);
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
    assertStrictEquals(
      logged,
      `[stored-brain-pick] the stored brain was dropped (${OWNER_GROQ}): denied`,
    );
  });

  it("ignores the row of an owner who left the organization, without reading it", async () => {
    const sb = lineChoices(false);
    const { asked, fakes } = resolvers(groq);

    const { result: engine, logged } = await lineTurn(sb, fakes);

    assertStrictEquals(engine, withoutPick);
    assertEquals(asked, [lineAsks]);
    assertEquals(
      sb.queries.map((query) => query.table),
      ["tenant_users"],
    );
    assertStrictEquals(
      logged,
      `[stored-brain-pick] the stored brain was dropped (${OWNER_LINE}): the line owner is not a member of the organization`,
    );
  });

  it("drops the pick when membership or the row cannot be read", async () => {
    for (const [table, message] of [
      [
        "tenant_users",
        `[stored-brain-pick] the line owner's membership could not be read (${OWNER_LINE}): tenant_users lookup failed: boom`,
      ],
      [
        "carmen_user_choices",
        `[stored-brain-pick] carmen_user_choices read failed for tenant ${LINE_TENANT}: boom`,
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
