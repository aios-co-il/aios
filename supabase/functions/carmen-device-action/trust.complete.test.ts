import { assertEquals } from "jsr:@std/assert@1";
import { answer, post, world } from "./handler.test-fixture.ts";
import {
  click,
  SHOP,
  SHOP_PAGE,
  tappedDone,
  trustOf,
} from "./trust.test-fixture.ts";

Deno.test("complete with a trust", async (t) => {
  await t.step(
    "records the trust once, for the action's own user, org and conversation",
    async () => {
      const { deps, tables } = world({ ...click(), status: "claimed" });

      const done = await answer(post(tappedDone(SHOP)), deps);

      assertEquals(done, { status: 200, body: { ok: true } });
      const [recorded] = tables.carmen_device_trusted_sites;
      assertEquals(tables.carmen_device_trusted_sites, [
        { id: recorded?.id, ...trustOf(SHOP) },
      ]);
    },
  );

  await t.step("a repeat of the same trust keeps one row", async () => {
    const { deps, tables } = world(
      { ...click(), status: "claimed" },
      { trusted: [trustOf(SHOP)] },
    );

    await answer(post(tappedDone(SHOP)), deps);

    assertEquals(tables.carmen_device_trusted_sites.length, 1);
  });

  await t.step("a completion without a trust records none", async () => {
    const { deps, tables } = world({ ...click(), status: "claimed" });

    await answer(post(tappedDone()), deps);

    assertEquals(tables.carmen_device_trusted_sites, []);
  });

  await t.step(
    "a forged trust for another origin is refused with the whole report",
    async () => {
      const { action, deps, tables } = world({ ...click(), status: "claimed" });

      const refused = await answer(
        post(tappedDone("https://bank.example")),
        deps,
      );

      assertEquals(refused.status, 400);
      assertEquals(action.status, "claimed");
      assertEquals(tables.carmen_device_trusted_sites, []);
    },
  );

  await t.step(
    "a trust on a navigation or a read is ignored, and the step still completes",
    async () => {
      const { action, deps, tables } = world({
        ...click(),
        tool: "browser_navigate",
        arguments: { url: `${SHOP}/form` },
        status: "claimed",
      });

      const done = await answer(
        post({
          ...tappedDone(SHOP),
          result: { ...SHOP_PAGE, title: "Form" },
        }),
        deps,
      );

      assertEquals(done.status, 200);
      assertEquals(action.status, "done");
      assertEquals(tables.carmen_device_trusted_sites, []);
    },
  );

  await t.step("a step outside a conversation records no trust", async () => {
    const { deps, tables } = world({
      ...click(),
      conversation_id: null,
      status: "claimed",
    });

    assertEquals((await answer(post(tappedDone(SHOP)), deps)).status, 200);
    assertEquals(tables.carmen_device_trusted_sites, []);
  });

  await t.step(
    "a failed trust write is logged and the completion stands",
    async () => {
      const { action, deps } = world(
        { ...click(), status: "claimed" },
        { failing: "carmen_device_trusted_sites" },
      );

      assertEquals((await answer(post(tappedDone(SHOP)), deps)).status, 200);
      assertEquals(action.status, "done");
    },
  );
});
