import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import { resolveBroadcastRecipientClientId } from "./recipient-client.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const CLIENT = "22222222-2222-4222-8222-222222222222";

/** An RPC stand-in that answers every call with `result`, or rejects with it. */
function fakeDb(result: { data: unknown; error: unknown } | Error) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      if (result instanceof Error) {
        return Promise.reject(result);
      }
      return Promise.resolve(result);
    },
  };
}

Deno.test("a client recipient is its entity id, without a lookup", async () => {
  const db = fakeDb({ data: null, error: null });
  assertStrictEquals(
    await resolveBroadcastRecipientClientId(db, TENANT, {
      entity_type: "client",
      entity_id: CLIENT,
      phone: "050-1234567",
    }),
    CLIENT,
  );
  assertStrictEquals(db.calls.length, 0);
});

Deno.test(
  "a manual recipient is matched by phone_match_key through find_phone_owner",
  async () => {
    const db = fakeDb({
      data: [{ lead_id: null, client_id: CLIENT }],
      error: null,
    });
    assertStrictEquals(
      await resolveBroadcastRecipientClientId(db, TENANT, {
        entity_type: "manual",
        phone: "+972 50-123-4567",
      }),
      CLIENT,
    );
    assertEquals(db.calls, [
      {
        fn: "find_phone_owner",
        args: { p_tenant_id: TENANT, p_match_key: "501234567" },
      },
    ]);
  },
);

Deno.test("leads, campaigners and groups are not clients", async () => {
  const db = fakeDb({ data: [{ client_id: CLIENT }], error: null });
  for (const entity_type of ["lead", "campaigner", "wa_group", null]) {
    assertStrictEquals(
      await resolveBroadcastRecipientClientId(db, TENANT, {
        entity_type,
        entity_id: CLIENT,
        phone: "0501234567",
      }),
      null,
      String(entity_type),
    );
  }
  assertStrictEquals(db.calls.length, 0);
});

Deno.test(
  "no match, a bad phone or a failing lookup resolve to null",
  async () => {
    assertStrictEquals(
      await resolveBroadcastRecipientClientId(
        fakeDb({ data: [{ lead_id: "l", client_id: null }], error: null }),
        TENANT,
        { entity_type: "manual", phone: "0501234567" },
      ),
      null,
    );
    const short = fakeDb({ data: [{ client_id: CLIENT }], error: null });
    assertStrictEquals(
      await resolveBroadcastRecipientClientId(short, TENANT, {
        entity_type: "manual",
        phone: "12",
      }),
      null,
    );
    assertStrictEquals(short.calls.length, 0);
    assertStrictEquals(
      await resolveBroadcastRecipientClientId(
        fakeDb({ data: null, error: { message: "denied" } }),
        TENANT,
        { entity_type: "manual", phone: "0501234567" },
      ),
      null,
    );
    assertStrictEquals(
      await resolveBroadcastRecipientClientId(
        fakeDb(new Error("network")),
        TENANT,
        { entity_type: "manual", phone: "0501234567" },
      ),
      null,
    );
  },
);
