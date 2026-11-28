import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { fakeSupabase } from "../_shared/testing/fake-supabase.ts";
import {
  withConsoleErrors,
  withConsoleLines,
} from "../_shared/testing/console-errors.ts";
import { personaReply } from "./persona-reply.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER_TENANT = "33333333-3333-4333-8333-333333333333";
const USER = "22222222-2222-4222-8222-222222222222";

type Row = Record<string, unknown>;

/** A member of TENANT, whose active tenant it is, over the given extra tables. */
function client(
  tables: Record<string, Array<Row>>,
  options: { superAdmin?: boolean; failing?: Record<string, string> } = {},
) {
  return fakeSupabase(
    { tenant_users: [{ tenant_id: TENANT, user_id: USER }], ...tables },
    {
      rpc: {
        get_user_tenant_id: () => TENANT,
        is_super_admin: () => options.superAdmin === true,
      },
      failing: options.failing,
    },
  );
}

/** The organization's Carmen style row. */
function style(value: string, tenantId = TENANT): Row {
  return {
    tenant_id: tenantId,
    setting_key: "carmen_avatar_style",
    setting_value: { style: value },
  };
}

describe("personaReply", () => {
  it("gives the organization's Mini Me, male by the caller's set, reading the style once", async () => {
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
    assertEquals(
      db.queries.filter((query) => query.table === "tenant_settings").length,
      1,
    );
  });

  it("gives the caller's own pick without reading the organization's style", async () => {
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
    assertEquals(
      db.queries.some((query) => query.table === "tenant_settings"),
      false,
    );
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

  it("answers a super admin for a tenant they are not a member of", async () => {
    const db = client(
      { tenant_settings: [style("minime", OTHER_TENANT)] },
      { superAdmin: true },
    );

    const reply = await personaReply(USER, OTHER_TENANT, db);

    assertEquals(reply.status, 200);
    assertEquals("key" in reply.body && reply.body.key, "minime");
  });

  it("refuses a tenant the caller is not a member of", async () => {
    const db = client({ tenant_settings: [style("minime", OTHER_TENANT)] });

    const { result, logged } = await withConsoleLines("warn", () =>
      personaReply(USER, OTHER_TENANT, db),
    );

    assertEquals(result, {
      status: 403,
      body: { error: "tenant_not_allowed" },
    });
    assertStringIncludes(logged, "rejected tenant_id");
  });

  it("refuses a tenant_id that is not a uuid, without reading anything for it", async () => {
    const db = client({ tenant_settings: [style("minime")] });

    const { result } = await withConsoleLines("warn", () =>
      personaReply(USER, "not-a-uuid", db),
    );

    assertEquals(result, {
      status: 403,
      body: { error: "tenant_not_allowed" },
    });
    assertEquals(db.queries.length, 0);
  });

  it("answers 500 and logs when the tenant cannot be resolved", async () => {
    const db = client({}, { failing: { get_user_tenant_id: "rpc down" } });

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
