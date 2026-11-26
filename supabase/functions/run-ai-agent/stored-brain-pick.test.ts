import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import {
  type BrainEngine,
  resolveBrainEngine,
} from "../_shared/carmen/brain-engine/load.ts";
import { USE_BRAIN_PICK } from "../_shared/carmen/brain-engine/stored-pick.ts";
import { withConsoleErrors } from "../_shared/testing/console-errors.ts";
import { fakeSupabase } from "../_shared/testing/fake-supabase.ts";
import {
  resolvePickAwareEngine,
  storedPickRequest,
} from "./stored-brain-pick.ts";
import {
  groq,
  resolvers,
  withoutPick,
} from "./stored-brain-pick.test-fixture.ts";

type Caller = Parameters<typeof storedPickRequest>[0];

const TENANT = "t-1";
const USER = "u-1";
const user: Caller = { kind: "user", userId: USER };
const asks = { [USE_BRAIN_PICK]: true, tenant_id: TENANT };
const STORED_GROQ = `tenant ${TENANT}, brain "groq"`;

/**
 * The user's row with `brain_slug` stored, plus another user's and another
 * org's; `failing` makes every read of the table fail with that message.
 */
function choices(brain_slug: string | null, failing?: string) {
  return fakeSupabase(
    {
      carmen_user_choices: [
        { tenant_id: TENANT, user_id: "u-2", brain_slug: "theirs" },
        { tenant_id: "t-2", user_id: USER, brain_slug: "elsewhere" },
        { tenant_id: TENANT, user_id: USER, brain_slug },
      ],
    },
    { failing: failing ? { carmen_user_choices: failing } : {} },
  );
}

describe("storedPickRequest", () => {
  it("names the row of a signed-in user who sent the flag and no brain", () => {
    const key = { tenantId: TENANT, userId: USER, lineOwner: false };

    assertEquals(storedPickRequest(user, asks), key);
    assertEquals(storedPickRequest(user, { ...asks, brain_slug: "" }), key);
    assertEquals(storedPickRequest(user, { ...asks, brain_slug: null }), key);
  });

  it("reads nothing unless the flag is exactly true", () => {
    assertStrictEquals(storedPickRequest(user, { tenant_id: TENANT }), null);
    for (const flag of [false, "true", 1, null, {}]) {
      assertStrictEquals(
        storedPickRequest(user, { ...asks, [USE_BRAIN_PICK]: flag }),
        null,
      );
    }
  });

  it("keeps the brain the request names, Carmen's own included", () => {
    for (const brain_slug of ["groq", "internal"]) {
      assertStrictEquals(
        storedPickRequest(user, { ...asks, brain_slug }),
        null,
      );
    }
  });

  it("reads nothing for a service caller or a caller without a user", () => {
    for (const caller of [
      null,
      { kind: "service", userId: null },
      { kind: "service", userId: USER },
      { kind: "user", userId: null },
      { kind: "user", userId: "" },
    ] as Array<Caller>) {
      assertStrictEquals(storedPickRequest(caller, asks), null);
    }
  });

  it("reads nothing without a tenant", () => {
    for (const tenant_id of [undefined, null, "", 7]) {
      assertStrictEquals(storedPickRequest(user, { ...asks, tenant_id }), null);
    }
  });
});

describe("resolvePickAwareEngine", () => {
  it("runs the stored brain, with Carmen's engine after it when that is granted", async () => {
    for (const internalAllowed of [true, false]) {
      const { asked, pickedAs, fakes } = resolvers(groq);

      const engine = await resolvePickAwareEngine(
        choices("groq"),
        user,
        asks,
        () => Promise.resolve(internalAllowed),
        fakes,
      );

      assertEquals(engine, { ...groq, fallbackInternal: internalAllowed });
      assertEquals(asked, [{ ...asks, brain_slug: "groq" }]);
      assertEquals(pickedAs, [{ auth: user, options: { strictGrant: false } }]);
    }
  });

  it("reads only the caller's own pick in the organization of the request", async () => {
    const sb = choices("groq");

    await resolvePickAwareEngine(
      sb,
      user,
      asks,
      () => Promise.resolve(true),
      resolvers(groq).fakes,
    );

    assertEquals(sb.queries, [
      {
        table: "carmen_user_choices",
        columns: "brain_slug",
        filters: [
          ["eq", "tenant_id", TENANT],
          ["eq", "user_id", USER],
        ],
        order: null,
        limit: null,
      },
    ]);
  });

  it("runs as if nothing were stored when nothing is, or the row cannot be read", async () => {
    for (const [sb, message] of [
      [choices(null), ""],
      [fakeSupabase({ carmen_user_choices: [] }), ""],
      [
        choices("groq", "boom"),
        `[stored-brain-pick] carmen_user_choices read failed (tenant ${TENANT}): boom`,
      ],
    ] as const) {
      const { asked, fakes } = resolvers(groq);

      const { result: engine, logged } = await withConsoleErrors(() =>
        resolvePickAwareEngine(
          sb,
          user,
          asks,
          () => Promise.resolve(true),
          fakes,
        ),
      );

      assertStrictEquals(engine, withoutPick);
      assertEquals(asked, [asks]);
      assertStrictEquals(logged, message);
    }
  });

  it("logs a stored brain the engine refuses and runs as if nothing were stored", async () => {
    for (const [refusal, outcome] of [
      [{ kind: "denied" }, "denied"],
      [{ kind: "refused", message: "not ready" }, "refused, not ready"],
    ] as Array<[BrainEngine, string]>) {
      const { asked, fakes } = resolvers(refusal);

      const { result: engine, logged } = await withConsoleErrors(() =>
        resolvePickAwareEngine(
          choices("groq"),
          user,
          asks,
          () => Promise.resolve(true),
          fakes,
        ),
      );

      assertStrictEquals(engine, withoutPick);
      assertEquals(asked, [{ ...asks, brain_slug: "groq" }, asks]);
      assertStrictEquals(
        logged,
        `[stored-brain-pick] the stored brain was dropped (${STORED_GROQ}): ${outcome}`,
      );
    }
  });

  it("runs without a stored brain that is no model brain, and logs nothing", async () => {
    const { asked, fakes } = resolvers({ kind: "internal" });

    const { result: engine, logged } = await withConsoleErrors(() =>
      resolvePickAwareEngine(
        choices("cursor"),
        user,
        asks,
        () => Promise.resolve(true),
        fakes,
      ),
    );

    assertStrictEquals(engine, withoutPick);
    assertEquals(asked, [{ ...asks, brain_slug: "cursor" }, asks]);
    assertStrictEquals(logged, "");
  });

  it("leaves a stored pick of Carmen's own engine to the engine resolver, which reads nothing for it", async () => {
    const sb = choices("internal");
    const { asked, fakes } = resolvers(groq);

    const { result: engine, logged } = await withConsoleErrors(() =>
      resolvePickAwareEngine(sb, user, asks, () => Promise.resolve(true), {
        ...fakes,
        resolveBrainEngine,
      }),
    );

    assertStrictEquals(engine, withoutPick);
    assertEquals(asked, [asks]);
    assertEquals(
      sb.queries.map((query) => query.table),
      ["carmen_user_choices"],
    );
    assertStrictEquals(logged, "");
  });

  it("logs a stored brain that could not be resolved and runs without it", async () => {
    const { fakes } = resolvers(new Error("connections read failed"));

    const { result: engine, logged } = await withConsoleErrors(() =>
      resolvePickAwareEngine(
        choices("groq"),
        user,
        asks,
        () => Promise.resolve(true),
        fakes,
      ),
    );

    assertStrictEquals(engine, withoutPick);
    assertStrictEquals(
      logged,
      `[stored-brain-pick] the stored brain could not be resolved (${STORED_GROQ}): connections read failed`,
    );
  });

  it("leaves a request that does not ask exactly as it was", async () => {
    const body = { tenant_id: TENANT, brain_slug: "cursor" };
    const sb = choices("groq");
    const { asked, fakes } = resolvers(groq);

    const engine = await resolvePickAwareEngine(
      sb,
      user,
      body,
      () => Promise.resolve(true),
      fakes,
    );

    assertStrictEquals(engine, withoutPick);
    assertEquals(sb.queries, []);
    assertStrictEquals(asked[0], body);
  });
});
