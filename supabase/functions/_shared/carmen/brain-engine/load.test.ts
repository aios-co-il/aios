import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { withConsoleErrors } from "../../testing/console-errors.ts";
import { fakeSupabase } from "../../testing/fake-supabase.ts";
import { resolveBrainEngine } from "./load.ts";

const TENANT = "t-1";
const CARMEN = "agent-carmen";
const USER = "u-1";
const user = { kind: "user" as const, userId: USER };
const asksGroq = { tenant_id: TENANT, brain_slug: "groq" };

/**
 * A tenant whose "groq" brain is ready to run, and the user's permissions
 * row with `brain_access`; `failing` names a table whose reads fail.
 */
function tenant(
  brain_access: Record<string, string>,
  failing: Record<string, string> = {},
) {
  return fakeSupabase(
    {
      ai_agents: [
        { id: CARMEN, tenant_id: TENANT, name: "Carmen", is_carmen: true },
      ],
      agent_brain_routes: [
        {
          tenant_id: TENANT,
          slug: "groq",
          label: "Groq",
          route_type: "model",
          connection_id: "c-1",
          active: true,
          config: null,
        },
      ],
      carmen_brain_connections: [
        {
          id: "c-1",
          tenant_id: TENANT,
          kind: "chat_model",
          slug: "groq",
          name: "Groq",
          // A public address literal: the target check needs no DNS.
          base_url: "https://8.8.8.8/v1",
          model: "m-1",
          profile: { client_data_ok: true },
          key_last4: "1234",
        },
      ],
      carmen_command_center_access: [
        {
          tenant_id: TENANT,
          agent_id: CARMEN,
          user_id: USER,
          enabled: true,
          brain_access,
        },
      ],
    },
    { rpc: { carmen_brain_secret_get: () => "sk-test" }, failing },
  );
}

/** The engine kind `resolveBrainEngine` gives the user for "groq". */
async function kindFor(
  sb: ReturnType<typeof tenant>,
  options?: { strictGrant: boolean },
) {
  const { result } = await withConsoleErrors(() =>
    resolveBrainEngine(sb, user, asksGroq, options),
  );

  return result.kind;
}

describe("resolveBrainEngine: the user's grant", () => {
  it("runs a granted brain and denies an ungranted one, strict or not", async () => {
    for (const options of [undefined, { strictGrant: true }]) {
      assertStrictEquals(
        await kindFor(tenant({ groq: "full" }), options),
        "connections",
      );
      assertStrictEquals(await kindFor(tenant({}), options), "denied");
    }
  });

  it("reads a grant it could not read as unrestricted, as it always did", async () => {
    for (const table of ["carmen_command_center_access", "ai_agents"]) {
      assertStrictEquals(
        await kindFor(tenant({}, { [table]: "boom" })),
        "connections",
      );
    }
  });

  it("throws on a grant it could not read when the grant must be read", async () => {
    for (const [table, message] of [
      ["carmen_command_center_access", "Carmen permissions read failed: boom"],
      ["ai_agents", "ai_agents read failed: boom"],
    ]) {
      const sb = tenant({}, { [table]: "boom" });

      await assertRejects(
        () => resolveBrainEngine(sb, user, asksGroq, { strictGrant: true }),
        Error,
        message,
      );
      assertEquals(
        sb.queries.some((query) => query.table === "carmen_brain_connections"),
        false,
      );
    }
  });
});
