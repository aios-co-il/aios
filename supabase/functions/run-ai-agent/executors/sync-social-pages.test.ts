import { assertEquals } from "jsr:@std/assert@1";
import { executeSyncSocialPages } from "./sync-social-pages.ts";
import { executorClient } from "./executor-client.test-fixture.ts";

Deno.test(
  "page sync invokes the function with the original tenant and client",
  async () => {
    const fixture = executorClient([{ error: "downstream" }], 400);
    assertEquals(
      await executeSyncSocialPages({ client_id: "client" }, fixture.context),
      { error: "downstream" },
    );
    assertEquals(fixture.calls[0].body, {
      tenant_id: "t1",
      client_id: "client",
    });
    assertEquals(
      new URL(fixture.calls[0].url).pathname,
      "/functions/v1/social-pages-sync",
    );
  },
);
