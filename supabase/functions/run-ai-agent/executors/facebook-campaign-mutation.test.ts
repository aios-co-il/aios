import { assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing/bdd";
import { executeFacebookCampaignMutation } from "./facebook-campaign-mutation.ts";
import {
  CAMPAIGNER_SCOPE,
  executorClient,
  withGlobalFetch,
} from "./executor-client.test-fixture.ts";

describe("executeFacebookCampaignMutation", () => {
  it("does not queue a duplicate of another client's campaign", async () => {
    const fixture = executorClient(
      (url) => {
        const select = url.searchParams.get("select");
        if (url.pathname.endsWith("/clients") && select === "agency_id") {
          return [{ agency_id: "a1" }];
        }
        if (url.pathname.endsWith("/clients") && select === "tenant_id") {
          return [{ tenant_id: "t1" }];
        }
        if (url.pathname.endsWith("/client_team")) {
          return [{ id: "link" }];
        }
        if (url.pathname.endsWith("/tenant_integrations")) {
          return [{ api_key: "token" }];
        }
        return [];
      },
      200,
      CAMPAIGNER_SCOPE,
    );

    const result = await withGlobalFetch(
      () => ({ id: "555", account_id: "999" }),
      () =>
        executeFacebookCampaignMutation(
          { client_id: "c1", campaign_id: "555" },
          { ...fixture.context, name: "duplicate_facebook_campaign" },
        ),
    );

    assertEquals(result, {
      error: "הקמפיין לא שייך ללקוח הזה — אי אפשר לשכפל אותו",
    });
    const queued = fixture.calls.filter((call) =>
      call.url.includes("/agent_approval_queue"),
    );
    assertEquals(queued, []);
  });
});
