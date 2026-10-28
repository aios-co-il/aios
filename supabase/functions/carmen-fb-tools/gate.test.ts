import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { fakeDb, rows } from "../_shared/ad-tools/fake-db.ts";
import { authorizeFbCall } from "./gate.ts";

const SERVICE = "service-role-key";
/** A client of tenant t2, whose agency is shared read_write with t1. */
const SHARED = "00000000-0000-4000-8000-0000000000c1";

/** An owner of t1 ("good" token) and SHARED linked to ad account 333. */
function ownerOfT1Db() {
  return fakeDb(
    {
      tenant_users: rows([{ role: "owner" }]),
      user_roles: rows([]),
      clients: rows([{ id: SHARED, tenant_id: "t2", agency_id: "ag" }]),
      crm_tables: rows([]),
      agency_tenant_access: rows([{ agency_id: "ag" }]),
    },
    {
      get_user_tenant_id: { data: "t1", error: null },
      is_super_admin: { data: false, error: null },
    },
  );
}

/** authorizeFbCall with recording token and Graph fakes. */
function gate(
  bearer: string,
  body: Record<string, unknown>,
  graph: { account_id?: string; error?: { code: number; message: string } },
) {
  const tokens: [string, string | null][] = [];
  const reads: string[] = [];
  const result = authorizeFbCall(
    new Request("http://local/carmen-fb-tools", {
      method: "POST",
      headers: { Authorization: `Bearer ${bearer}` },
    }),
    body,
    {
      db: ownerOfT1Db(),
      serviceRoleKey: SERVICE,
      resolveFbToken: async (tenantId, clientId) => {
        tokens.push([tenantId, clientId]);
        return `token-${tenantId}`;
      },
      fbGet: async (path, _fields, token) => {
        reads.push(`${path}:${token}`);
        return graph;
      },
    },
  );
  return { result, tokens, reads };
}

const pauseShared = {
  action: "pause",
  entity_id: "9003",
  client_id: SHARED,
  tenant_id: "t2",
};

Deno.test(
  "authorizeFbCall: a user reads the Meta object with their own tenant's token",
  async () => {
    const call = gate("good", pauseShared, { account_id: "333" });
    const res = await call.result;
    assertStrictEquals(res.ok && res.caller.tenantId, "t1");
    assertEquals(call.tokens, [["t1", null]]);
    assertEquals(call.reads, ["9003:token-t1"]);
  },
);

Deno.test(
  "authorizeFbCall: a Graph error answer is fb_object_unreachable",
  async () => {
    const call = gate("good", pauseShared, {
      error: { code: 190, message: "Error validating access token" },
    });
    const res = await call.result;
    assertStrictEquals(res.ok, false);
    assertStrictEquals(!res.ok && res.status, 403);
    assertStrictEquals(!res.ok && res.error, "fb_object_unreachable");
  },
);

Deno.test(
  "authorizeFbCall: the service role makes no token or Graph call",
  async () => {
    const call = gate(SERVICE, pauseShared, { account_id: "333" });
    assertEquals(await call.result, {
      ok: true,
      caller: { kind: "service_role", tenantId: "t2" },
    });
    assertEquals(call.tokens, []);
    assertEquals(call.reads, []);
  },
);
