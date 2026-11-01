import { assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { memoryDb } from "./memory-db.ts";
import { resolveMetaToken } from "./meta-token.ts";

describe("resolveMetaToken", () => {
  it("uses the table's own tenant only, never an agency source tenant's", async () => {
    const db = memoryDb({
      agency_tenant_access: [
        { accessing_tenant_id: "tenant-A", source_tenant_id: "tenant-B" },
      ],
      tenant_integrations: [
        {
          id: "b-conn",
          tenant_id: "tenant-B",
          integration_type: "facebook",
          is_active: true,
          connection_visibility: "org",
          api_key: "token-of-B",
          updated_at: "2026-10-25T00:00:00Z",
        },
      ],
    });
    const table = {
      id: "t1",
      tenant_id: "tenant-A",
      client_id: "c1",
      integration_type: "facebook_insights",
      integration_settings: { ad_account_id: "act_1" },
    };
    // Same as sync-facebook-insights: no token on tenant A means no token.
    assertStrictEquals(await resolveMetaToken(db, table), null);
    // Carmen's live check may still pass the caller's tenant explicitly.
    assertStrictEquals(
      await resolveMetaToken(db, table, ["tenant-B"]),
      "token-of-B",
    );
  });
});
