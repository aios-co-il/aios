import { assertEquals } from "jsr:@std/assert@1";
import { tenantAppLink } from "./app-link.ts";
import { TENANT } from "./tests/fake-world.ts";
import { recordingClient } from "./tests/recording-client.ts";

Deno.test("tenantAppLink", async (t) => {
  await t.step("links the path under the tenant's own slug", async () => {
    const { db, calls } = recordingClient(() => ({ slug: "acme" }));

    const link = await tenantAppLink(
      db,
      TENANT,
      "https://aios.test/",
      "card-drafts",
    );

    assertEquals(link, "https://aios.test/t/acme/card-drafts");
    assertEquals(calls[0].query.get("id"), `eq.${TENANT}`);
  });

  await t.step("builds nothing without an app URL or a slug", async () => {
    const { db, calls } = recordingClient(() => ({ slug: null }));

    assertEquals(await tenantAppLink(db, TENANT, null, "chat/"), null);
    assertEquals(calls.length, 0);
    assertEquals(
      await tenantAppLink(db, TENANT, "https://aios.test", "chat/"),
      null,
    );
  });
});
