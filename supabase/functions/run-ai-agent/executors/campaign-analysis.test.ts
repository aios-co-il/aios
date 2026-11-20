import { assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing/bdd";
import {
  CAMPAIGN_NOT_OF_CLIENT,
  fbAnalyzeCampaignInline,
} from "./campaign-analysis.ts";
import {
  executorClient,
  withGlobalFetch,
} from "./executor-client.test-fixture.ts";

function graph(url: URL) {
  return url.pathname.endsWith("/555")
    ? { id: "555", name: "Campaign", account_id: "999" }
    : { data: [] };
}

function database(linkedClientIds: Array<string>) {
  return (url: URL) => {
    const select = url.searchParams.get("select");
    if (url.pathname.endsWith("/clients") && select === "tenant_id") {
      return [{ tenant_id: "t1" }];
    }
    if (url.pathname.endsWith("/clients")) {
      return linkedClientIds.map((id) => ({ id }));
    }
    if (url.pathname.endsWith("/tenant_integrations")) {
      return [{ api_key: "token" }];
    }
    return [];
  };
}

describe("fbAnalyzeCampaignInline", () => {
  it("refuses a campaign whose ad account is not linked to the client", async () => {
    const fixture = executorClient(database([]));

    const result = await withGlobalFetch(graph, () =>
      fbAnalyzeCampaignInline(fixture.context.supabase, "t1", "c1", "555"),
    );

    assertEquals(result, { error: CAMPAIGN_NOT_OF_CLIENT });
  });

  it("analyses a campaign under the client's ad account", async () => {
    const fixture = executorClient(database(["c1"]));

    const result = await withGlobalFetch(graph, () =>
      fbAnalyzeCampaignInline(fixture.context.supabase, "t1", "c1", "555"),
    );

    assertNotEquals(result.error, CAMPAIGN_NOT_OF_CLIENT);
    assertEquals(result.campaign?.name, "Campaign");
  });
});
