import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import {
  createFakeDb,
  fakeClient,
  type Row,
} from "../_shared/meeting-bot/fake-db.test-fixture.ts";
import {
  withConsoleErrors,
  withConsoleLines,
} from "../_shared/testing/console-errors.ts";
import { personaReply } from "./persona-reply.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER_TENANT = "33333333-3333-4333-8333-333333333333";
const USER = "22222222-2222-4222-8222-222222222222";

/** A member of TENANT whose active tenant is TENANT, over the given extra tables. */
function client(tables: Record<string, Array<Row>>, rpcError = false) {
  const db = fakeClient(
    createFakeDb({
      tenant_users: [{ tenant_id: TENANT, user_id: USER }],
      ...tables,
    }),
  );
  return {
    from: db.from.bind(db),
    rpc: (name: string) =>
      Promise.resolve(
        rpcError
          ? { data: null, error: { message: "rpc down" } }
          : {
              data: name === "get_user_tenant_id" ? TENANT : false,
              error: null,
            },
      ),
  };
}

/** The organization's Carmen style row. */
function style(value: string): Row {
  return {
    tenant_id: TENANT,
    setting_key: "carmen_avatar_style",
    setting_value: { style: value },
  };
}

describe("personaReply", () => {
  it("gives the organization's Mini Me, male by the caller's set, when the caller picked none", async () => {
    const db = client({
      tenant_settings: [style("minime")],
      profiles: [{ id: USER, minime_gender: null, gender: "male" }],
    });

    const reply = await personaReply(USER, TENANT, db);

    assertEquals(reply, {
      status: 200,
      body: {
        key: "minime",
        display_name: "מיני מי",
        look: "minime",
        gender: "male",
      },
    });
  });

  it("gives the caller's own pick before the organization's style", async () => {
    const db = client({
      tenant_settings: [style("minime")],
      carmen_persona_choices: [
        { tenant_id: TENANT, user_id: USER, persona_key: "carmen" },
      ],
    });

    const reply = await personaReply(USER, TENANT, db);

    assertEquals(reply.body, {
      key: "carmen",
      display_name: "כרמן",
      look: "character",
      gender: "female",
    });
  });

  it("follows a female Mini Me set", async () => {
    const db = client({
      tenant_settings: [style("minime")],
      profiles: [{ id: USER, minime_gender: "female", gender: "male" }],
    });

    const reply = await personaReply(USER, TENANT, db);

    assertEquals(reply.status, 200);
    assertEquals("gender" in reply.body && reply.body.gender, "female");
  });

  it("is Carmen herself with the organization's name and style otherwise", async () => {
    const db = client({
      tenant_settings: [style("character")],
      ai_agents: [
        {
          tenant_id: TENANT,
          name: "רוני",
          is_carmen: true,
          is_active: true,
          metadata: null,
        },
      ],
    });

    const reply = await personaReply(USER, null, db);

    assertEquals(reply.body, {
      key: null,
      display_name: "רוני",
      look: "character",
      gender: "female",
    });
  });

  it("refuses a tenant the caller is not a member of", async () => {
    const db = client({ tenant_settings: [style("minime")] });

    const { result, logged } = await withConsoleLines("warn", () =>
      personaReply(USER, OTHER_TENANT, db),
    );

    assertEquals(result, {
      status: 403,
      body: { error: "tenant_not_allowed" },
    });
    assertStringIncludes(logged, "rejected tenant_id");
  });

  it("answers 500 and logs when the tenant cannot be resolved", async () => {
    const db = client({}, true);

    const { result, logged } = await withConsoleErrors(() =>
      personaReply(USER, undefined, db),
    );

    assertEquals(result, {
      status: 500,
      body: { error: "persona_lookup_failed" },
    });
    assertStringIncludes(logged, "persona tenant read failed");
  });
});
