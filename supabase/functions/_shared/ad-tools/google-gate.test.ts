import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { ANON_KEY } from "../auth/jwt-test-fixtures.ts";
import type { AdToolAuthResult } from "./caller.ts";
import { authorizeGoogleToolRequest } from "./google-gate.ts";
import { A, B, SERVICE, identity, store, tokenOf } from "./test-fixtures.ts";

function gadsGate(
  bearer: string | null,
  body: Record<string, unknown>,
  calls: string[] = [],
) {
  return authorizeGoogleToolRequest({
    authorization: bearer === null ? null : `Bearer ${bearer}`,
    serviceRoleKey: SERVICE,
    body: { confirmed: true, ...body },
    identity: identity(calls),
    store: store(),
  });
}

const pause = (customer_id: string, tenant_id: string = A) => ({
  action: "pause",
  customer_id,
  campaign_id: "77",
  tenant_id,
});

function denied(res: AdToolAuthResult, status: number, error?: string) {
  assertStrictEquals(res.ok, false);
  if (res.ok) {
    return;
  }
  assertStrictEquals(res.status, status);
  if (error) {
    assertStrictEquals(res.error, error);
  }
}

Deno.test(
  "authorizeGoogleToolRequest: no bearer or anon key get 401",
  async () => {
    const calls: string[] = [];
    denied(await gadsGate(null, pause("1112223333")), 401);
    denied(await gadsGate(ANON_KEY, pause("1112223333"), calls), 401);
    assertEquals(calls, []);
  },
);

Deno.test(
  "authorizeGoogleToolRequest: service role keeps the body tenant",
  async () => {
    const calls: string[] = [];
    // campaign-scheduler-cron may pass customer_id = tenant id; still trusted.
    const res = await gadsGate(SERVICE, pause(B, B), calls);
    assertEquals(res, {
      ok: true,
      caller: { kind: "service_role", tenantId: B },
    });
    assertEquals(calls, []);
  },
);

Deno.test(
  "authorizeGoogleToolRequest: a user of another tenant is refused",
  async () => {
    denied(
      await gadsGate(tokenOf("ownerB"), pause("1112223333", A)),
      403,
      "target_out_of_scope",
    );
  },
);

Deno.test("authorizeGoogleToolRequest: campaigner may not write", async () => {
  denied(
    await gadsGate(tokenOf("campaignerA"), pause("1112223333")),
    403,
    "approver_role_required",
  );
});

Deno.test("authorizeGoogleToolRequest: owner may write in scope", async () => {
  const owner = tokenOf("ownerA");
  for (const customer of ["1112223333", "111-222-3333", "3334445555"]) {
    const res = await gadsGate(owner, pause(customer));
    assertStrictEquals(res.ok && res.caller.tenantId, A);
  }
  assertStrictEquals(
    (await gadsGate(tokenOf("agencyOwnerA"), pause("1112223333"))).ok,
    true,
  );
});

Deno.test(
  "authorizeGoogleToolRequest: owner is refused outside scope",
  async () => {
    const owner = tokenOf("ownerA");
    denied(
      await gadsGate(owner, pause("2223334444")),
      403,
      "target_out_of_scope",
    );
    denied(
      await gadsGate(owner, pause("9998887777")),
      403,
      "target_out_of_scope",
    );
    denied(await gadsGate(owner, pause("abc")), 400, "invalid_customer_id");
    denied(
      await gadsGate(owner, {
        ...pause("1112223333"),
        campaign_id: "1 OR 1=1",
      }),
      400,
      "invalid_campaign_id",
    );
  },
);

Deno.test(
  "authorizeGoogleToolRequest: a forged body tenant_id is ignored",
  async () => {
    const owner = tokenOf("ownerA");
    const res = await gadsGate(owner, pause("1112223333", B));
    assertStrictEquals(res.ok && res.caller.tenantId, A);
    denied(
      await gadsGate(owner, pause("2223334444", B)),
      403,
      "target_out_of_scope",
    );
  },
);
