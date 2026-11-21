import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { executeSaveMediaFromChat } from "./save-media-from-chat.ts";
import { executorClient } from "./executor-client.test-fixture.ts";

Deno.test(
  "media saving cannot override trusted tenant and creator",
  async () => {
    const fixture = executorClient([{ id: "media" }], 200, { userId: "user" });
    const args = {
      media_url: "https://example.com/image",
      tenant_id: "forged",
      created_by: "forged",
    };
    assertEquals(await executeSaveMediaFromChat(args, fixture.context), {
      id: "media",
    });
    assertEquals(fixture.calls[0].body, {
      ...args,
      tenant_id: "t1",
      created_by: "user",
    });
    assertEquals(
      new URL(fixture.calls[0].url).pathname,
      "/functions/v1/carmen-save-media",
    );
  },
);

Deno.test("media saving retains downstream error text", async () => {
  const fixture = executorClient([{ error: "denied" }], 403);
  await assertRejects(
    () => executeSaveMediaFromChat({}, fixture.context),
    Error,
    "denied",
  );
});
