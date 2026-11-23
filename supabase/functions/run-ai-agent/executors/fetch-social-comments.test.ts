import { assertEquals } from "jsr:@std/assert@1";
import { executeFetchSocialComments } from "./fetch-social-comments.ts";
import { executorClient } from "./executor-client.test-fixture.ts";

Deno.test(
  "comment fetch uses the client and preserves downstream JSON errors",
  async () => {
    const fixture = executorClient([{ error: "denied" }], 403);
    assertEquals(
      await executeFetchSocialComments({ page_id: "page" }, fixture.context),
      { error: "denied" },
    );
    assertEquals(fixture.calls.length, 1);
    assertEquals(
      new URL(fixture.calls[0].url).pathname,
      "/functions/v1/social-comments",
    );
    assertEquals(fixture.calls[0].method, "POST");
    assertEquals(fixture.calls[0].body, {
      action: "fetch",
      tenant_id: "t1",
      page_id: "page",
    });
  },
);
