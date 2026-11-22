import { assertEquals } from "jsr:@std/assert@1";
import { executePublishSocialPost } from "./publish-social-post.ts";
import { executorClient } from "./executor-client.test-fixture.ts";

Deno.test("publishing requires confirmation before invocation", async () => {
  const fixture = executorClient([], 200, {
    callerScope: {
      isManagerRole: true,
      isTeamManager: false,
      managedAgencyIds: [],
      accessibleTenantIds: ["t1"],
    },
  });
  const result = await executePublishSocialPost(
    { page_id: "page", post_type: "post", confirmed: false },
    fixture.context,
  );
  assertEquals(result.error, "not_confirmed");
  assertEquals(fixture.calls.length, 0);
});

Deno.test(
  "confirmed publishing retains its payload and JSON HTTP error",
  async () => {
    const fixture = executorClient([{ error: "denied" }], 400, {
      callerScope: {
        isManagerRole: true,
        isTeamManager: false,
        managedAgencyIds: [],
        accessibleTenantIds: ["t1"],
      },
    });
    const result = await executePublishSocialPost(
      { page_id: "page", post_type: "post", confirmed: true },
      fixture.context,
    );
    assertEquals(result, { error: "denied" });
    assertEquals(fixture.calls[0].body, {
      tenant_id: "t1",
      page_id: "page",
      post_type: "post",
    });
    assertEquals(
      new URL(fixture.calls[0].url).pathname,
      "/functions/v1/social-publish",
    );
  },
);
