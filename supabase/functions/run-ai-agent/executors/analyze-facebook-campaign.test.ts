import { assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing/bdd";
import { executeAnalyzeFacebookCampaign } from "./analyze-facebook-campaign.ts";
import {
  CAMPAIGNER_SCOPE,
  executorClient,
  withGlobalFetch,
} from "./executor-client.test-fixture.ts";

function noFallback(): never {
  throw new Error("fb-campaign-analyze must not be called");
}

describe("executeAnalyzeFacebookCampaign", () => {
  it("keeps a campaigner off the unchecked fallback when the live read fails", async () => {
    const fixture = executorClient(
      (url) => {
        const select = url.searchParams.get("select");
        if (url.pathname.endsWith("/clients") && select === "tenant_id") {
          return [{ tenant_id: "t1" }];
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

    const result = await withGlobalFetch(noFallback, () =>
      executeAnalyzeFacebookCampaign(
        { client_id: "c1", campaign_id: "555" },
        fixture.context,
      ),
    );

    assertEquals(result.error, "fb_not_connected");
  });
});
