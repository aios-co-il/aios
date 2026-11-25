import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { executeSearchEntities } from "./search-entities.ts";
import { executorClient } from "./executor-client.test-fixture.ts";

Deno.test(
  "search-entities surfaces database failures instead of reporting missing data",
  async () => {
    const fixture = executorClient(
      [{ message: "database failed" }, { message: "fallback failed" }],
      500,
      { callerCampaignerId: "campaigner" },
    );
    await assertRejects(() =>
      executeSearchEntities(
        { entity_type: "client", search_term: "test" },
        fixture.context,
      ),
    );
    assertEquals(
      fixture.calls.some((call) => call.method !== "GET"),
      false,
    );
  },
);
