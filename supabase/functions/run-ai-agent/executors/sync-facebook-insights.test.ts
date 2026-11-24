import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing/bdd";
import { AccessDeniedError } from "../../_shared/auth-helpers.ts";
import { executeSyncFacebookInsights } from "./sync-facebook-insights.ts";
import {
  CAMPAIGNER_SCOPE,
  executorClient,
  withGlobalFetch,
} from "./executor-client.test-fixture.ts";

function tableRow(clientId: string | null) {
  return {
    id: "tbl1",
    name: "Report",
    tenant_id: "t1",
    integration_type: "facebook_insights",
    client_id: clientId,
  };
}

function noSyncRequest(): never {
  throw new Error("the sync function must not be called");
}

describe("executeSyncFacebookInsights", () => {
  it("refuses a table_id whose client is not the campaigner's", async () => {
    const fixture = executorClient(
      (url) => {
        if (url.pathname.endsWith("/crm_tables")) {
          return [tableRow("c9")];
        }
        if (url.pathname.endsWith("/clients")) {
          return [{ agency_id: "a1" }];
        }
        return [];
      },
      200,
      CAMPAIGNER_SCOPE,
    );

    await withGlobalFetch(noSyncRequest, () =>
      assertRejects(
        () =>
          executeSyncFacebookInsights(
            { table_id: "tbl1" },
            { ...fixture.context, name: "sync_facebook_insights" },
          ),
        AccessDeniedError,
      ),
    );
  });

  it("refuses a campaigner a table with no client", async () => {
    const fixture = executorClient(
      (url) => (url.pathname.endsWith("/crm_tables") ? [tableRow(null)] : []),
      200,
      CAMPAIGNER_SCOPE,
    );

    const result = await withGlobalFetch(noSyncRequest, () =>
      executeSyncFacebookInsights(
        { table_id: "tbl1" },
        { ...fixture.context, name: "sync_facebook_insights" },
      ),
    );

    assertEquals(result, {
      error: "לטבלה זו אין לקוח משויך — רק מנהל יכול לסנכרן אותה",
    });
  });

  it("refuses a table with no client to a non-manager with no campaigner identity", async () => {
    const fixture = executorClient(
      (url) => (url.pathname.endsWith("/crm_tables") ? [tableRow(null)] : []),
      200,
      {
        callerScope: {
          callerCampaignerId: null,
          isManagerRole: false,
          isTeamManager: false,
          managedAgencyIds: [],
          accessibleTenantIds: ["t1"],
        },
      },
    );

    const result = await withGlobalFetch(noSyncRequest, () =>
      executeSyncFacebookInsights(
        { table_id: "tbl1" },
        { ...fixture.context, name: "sync_facebook_insights" },
      ),
    );

    assertEquals(result, {
      error: "לטבלה זו אין לקוח משויך — רק מנהל יכול לסנכרן אותה",
    });
  });
});
