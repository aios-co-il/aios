import { assertEquals } from "jsr:@std/assert@1";
import { at } from "../../_shared/pulse/test-fixtures.ts";
import { resolveSeoClient } from "./client.ts";
import {
  AGENCY_A,
  AGENCY_B,
  CLIENT_ID,
  OTHER_TENANT,
  TENANT,
  clientRow,
  fakeSeoDb,
  seoCtx,
} from "./fake-db.test-fixture.ts";

// An owner of TENANT (a manager: the caller-access check passes) whose tenant
// was shared agency A of OTHER_TENANT, so getAccessibleTenantIds holds both.
const sharedCaller = {
  ...seoCtx(),
  accessibleTenantIds: [TENANT, OTHER_TENANT],
};
const shareOfAgencyA = {
  source_tenant_id: OTHER_TENANT,
  accessing_tenant_id: TENANT,
  agency_id: AGENCY_A,
};

/** Resolves CLIENT_ID for the shared caller with the given client row. */
function resolveAs(client: Record<string, unknown>) {
  const db = fakeSeoDb({
    clients: [client],
    agency_tenant_access: [shareOfAgencyA],
  });
  return resolveSeoClient(db, sharedCaller, CLIENT_ID);
}

Deno.test(
  "a share of agency A never opens the source tenant's agency B clients",
  async () => {
    const answer = await resolveAs(
      clientRow({ tenant_id: OTHER_TENANT, agency_id: AGENCY_B }),
    );
    assertEquals(at(answer, "error"), "client_not_found");
  },
);

Deno.test("a client in the exact shared agency is readable", async () => {
  const answer = await resolveAs(
    clientRow({ tenant_id: OTHER_TENANT, agency_id: AGENCY_A }),
  );
  assertEquals(at(answer, "id"), CLIENT_ID);
  assertEquals(at(answer, "tenantId"), OTHER_TENANT);
});

Deno.test("the caller's own clients stay readable in any agency", async () => {
  const answer = await resolveAs(clientRow({ agency_id: AGENCY_B }));
  assertEquals(at(answer, "tenantId"), TENANT);
});
