import { assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing/bdd";
import { findPendingAdDuplicate } from "./pending-ad-duplicate.ts";
import { executorClient } from "./executor-client.test-fixture.ts";

describe("findPendingAdDuplicate", () => {
  it("duplicate approvals reuse the newest matching source within the tenant", async () => {
    const fixture = executorClient([
      [
        { id: "other", tool_input: { source_ad_id: "other" } },
        { id: "match", tool_input: { source_ad_id: "source" } },
        { id: "older", tool_input: { source_ad_id: "source" } },
      ],
    ]);

    const approval = await findPendingAdDuplicate(
      fixture.context.supabase,
      "t1",
      "source",
    );

    assertEquals(approval?.id, "match");

    const query = new URL(fixture.calls[0].url).searchParams;
    assertEquals(query.get("tenant_id"), "eq.t1");
    assertEquals(query.get("status"), "eq.pending");
    assertEquals(query.get("limit"), "5");
    assertEquals(query.get("order"), "created_at.desc");
    assertEquals(fixture.calls[0].method, "GET");
  });
});
