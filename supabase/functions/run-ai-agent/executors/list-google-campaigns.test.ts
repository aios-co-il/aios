import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing/bdd";
import { AccessDeniedError } from "../../_shared/auth-helpers.ts";
import { executeListGoogleCampaigns } from "./list-google-campaigns.ts";
import {
  CAMPAIGNER_SCOPE,
  executorClient,
  MANAGER_SCOPE,
} from "./executor-client.test-fixture.ts";

const NO_CONNECTION = { error: "אין חיבור Google Ads פעיל לטננט" };

describe("executeListGoogleCampaigns", () => {
  it("refuses a campaigner's customer_id with no client of theirs", async () => {
    const fixture = executorClient(() => [], 200, CAMPAIGNER_SCOPE);

    await assertRejects(
      () =>
        executeListGoogleCampaigns(
          { customer_id: "1234567890" },
          fixture.context,
        ),
      AccessDeniedError,
    );

    const integrationReads = fixture.calls.filter((call) =>
      call.url.includes("/tenant_integrations"),
    );
    assertEquals(integrationReads, []);
  });

  it("asks a campaigner with no linked phone to add it before reading a customer", async () => {
    const fixture = executorClient(() => [], 200, {
      callerRole: "campaigner",
      callerScope: {
        callerCampaignerId: null,
        isManagerRole: false,
        isTeamManager: false,
        managedAgencyIds: [],
        accessibleTenantIds: ["t1", "shared"],
      },
    });

    const error = await assertRejects(
      () =>
        executeListGoogleCampaigns(
          { customer_id: "1234567890" },
          fixture.context,
        ),
      AccessDeniedError,
    );

    assertEquals(error.message.includes("אזור האישי"), true);
    assertEquals(fixture.calls, []);
  });

  it("lets a campaigner read a customer linked to an assigned client", async () => {
    const fixture = executorClient(
      (url) => {
        const select = url.searchParams.get("select");
        if (url.pathname.endsWith("/clients") && select === "id") {
          return [{ id: "c1" }];
        }
        if (url.pathname.endsWith("/clients")) {
          return [{ agency_id: "a1" }];
        }
        if (url.pathname.endsWith("/client_team")) {
          return [{ id: "link" }];
        }
        return [];
      },
      200,
      CAMPAIGNER_SCOPE,
    );

    const result = await executeListGoogleCampaigns(
      { customer_id: "123-456-7890" },
      fixture.context,
    );

    assertEquals(result, NO_CONNECTION);
  });

  it("keeps a manager's customer_id read without a client lookup", async () => {
    const fixture = executorClient(() => [], 200, MANAGER_SCOPE);

    const result = await executeListGoogleCampaigns(
      { customer_id: "1234567890" },
      fixture.context,
    );

    assertEquals(result, NO_CONNECTION);
    const clientReads = fixture.calls.filter(
      (call) =>
        call.url.includes("/clients") || call.url.includes("/crm_tables"),
    );
    assertEquals(clientReads, []);
  });
});
