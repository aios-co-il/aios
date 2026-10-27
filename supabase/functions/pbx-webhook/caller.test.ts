import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { resolveCaller } from "./caller.ts";
import { WebhookError } from "./errors.ts";

const settings = { extensions: [{ extension: "101", user_id: "dana" }] };

Deno.test("resolveCaller", async (t) => {
  await t.step("a mapped extension names its agent", async () => {
    const fallback = () => Promise.reject(new Error("not asked"));
    assertEquals(await resolveCaller(settings, "101", fallback), {
      userId: "dana",
      resolution: "extension",
    });
  });

  await t.step(
    "an unknown or missing extension falls back and says so",
    async () => {
      const fallback = () => Promise.resolve("first-user");
      assertEquals(await resolveCaller(settings, "999", fallback), {
        userId: "first-user",
        resolution: "fallback",
      });
      assertEquals(await resolveCaller({}, null, fallback), {
        userId: "first-user",
        resolution: "fallback",
      });
    },
  );

  await t.step("a tenant without users is refused", async () => {
    await assertRejects(
      () => resolveCaller({}, "101", () => Promise.resolve(null)),
      WebhookError,
      "No tenant user found",
    );
  });
});
